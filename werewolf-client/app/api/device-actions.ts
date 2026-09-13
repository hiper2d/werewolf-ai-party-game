'use server';

import {randomUUID} from "crypto";
import {cookies, headers} from "next/headers";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "@/firebase/server";
import {appendCapped, appendSighting, pickLinkedDevice} from "@/app/utils/device-utils";
import {logger} from "@/app/utils/logger";

/**
 * Browser identity: one id per browser profile, used to meter free-tier spend per DEVICE
 * as well as per account (see FREE_TIER_LIMITS.DEVICE_DAILY_SPEND_USD).
 *
 * WHY THIS EXISTS (2026-09-13): one user ran four Google accounts - his own plus three
 * sequentially numbered burners - and hopped to the next one nine minutes after the
 * per-account daily cap refused him. Four accounts burned 41% of a month's free-tier
 * spend between them. Per-account caps cannot see that; a per-browser budget can, because
 * multi-account sign-in happens inside ONE browser profile.
 *
 * WHAT THIS IS NOT: a security boundary. The id is client-held, so an incognito window
 * defeats it in one keystroke and devtools defeats it in two. It raises the cost of
 * casual farming from "click new account" to "clear state and change IP". The ceiling
 * that genuinely cannot be gamed by making accounts is the platform-wide daily cap.
 *
 * SURVIVABILITY is the reason the id lives in two places at once. An httpOnly cookie and
 * localStorage clear under different conditions: Safari's ITP caps script-set cookie
 * lifetime at seven days while leaving localStorage alone, several "clear cookies" flows
 * leave localStorage untouched, and extensions routinely do one and not the other. Each
 * store restores the other on the next visit, so the id dies only if both die together.
 * The server owns the cookie (httpOnly, so page scripts cannot edit it) and hands the
 * canonical id back to the client, which mirrors it into localStorage.
 *
 * IP LINKING (2026-09-13): a wiped browser loses both stores, which is exactly what the
 * farmer does before the next account. So a browser that arrives with NO id does not get
 * a fresh one right away: if a device was seen from the same public IP within the last
 * twelve hours (and the edge's city, when known, agrees), that device id is adopted — the
 * new account lands on the old device's shared budget and both records say how the link
 * was made. Only when nothing matches is a new id minted. The IP itself is never a key
 * for refusals; it only decides which existing id a keyless browser inherits. See
 * `pickLinkedDevice` for the exact rule.
 */

const DEVICE_COOKIE = 'ww_device';
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 730; // 2 years
// NOT exported: a 'use server' module may only export async functions, and a single
// non-function export silently voids every export in the file at build time.
const DEVICES = 'devices';
const IPS = 'ips';

/** Keep the clustering arrays bounded; a farm is visible in a handful of entries. */
const DEVICE_USER_CAP = 20;
const DEVICE_IP_CAP = 10;
const IP_DEVICE_CAP = 10;
const DEVICE_LINK_CAP = 10;

/** Firestore document ids may not contain '/'; IPv4 and IPv6 are otherwise safe as ids. */
function ipDocId(ip: string): string {
    return ip.replace(/\//g, '_');
}

/** Which device, if any, a keyless browser on `ip` should inherit. Best effort: any failure means "none". */
async function findRecentDeviceForIp(ip: string, city: string | undefined): Promise<string | undefined> {
    if (!db) {
        return undefined;
    }
    try {
        const snap = await db.collection(IPS).doc(ipDocId(ip)).get();
        return pickLinkedDevice(snap.data()?.devices, Date.now(), city)?.deviceId;
    } catch (error: any) {
        console.error(`findRecentDeviceForIp: lookup failed for ${ip}: ${error?.message ?? error}`);
        return undefined;
    }
}

/** v4 UUID, the only shape we accept from a client. Anything else is treated as absent. */
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidDeviceId(value: unknown): value is string {
    return typeof value === 'string' && DEVICE_ID_RE.test(value);
}

/**
 * The client's public IP. Vercel overwrites `x-forwarded-for` at the edge and refuses to
 * forward externally supplied values, so unlike the device id this one cannot be spoofed
 * from the client. `x-vercel-forwarded-for` is the same value but survives a proxy in
 * front of Vercel, so it is preferred when present.
 */
async function readClientIp(): Promise<string | undefined> {
    const h = await headers();
    const raw = h.get('x-vercel-forwarded-for')
        || h.get('x-forwarded-for')
        || h.get('x-real-ip')
        || '';
    // x-forwarded-for may be a comma-separated chain; the client is the first entry.
    const first = raw.split(',')[0]?.trim();
    return first || undefined;
}

/**
 * Coarse geo the edge already resolved, free of charge and without a geo-IP library.
 * City names arrive RFC3986-encoded. Used only to make a farm legible in the ops report
 * ("four accounts, one city, one hour"); nothing is ever refused on geo.
 */
async function readClientGeo(): Promise<Record<string, string>> {
    const h = await headers();
    const decode = (v: string | null) => {
        if (!v) return undefined;
        try {
            return decodeURIComponent(v);
        } catch {
            return v;
        }
    };
    const geo: Record<string, string> = {};
    const country = h.get('x-vercel-ip-country');
    const region = h.get('x-vercel-ip-country-region');
    const city = decode(h.get('x-vercel-ip-city'));
    const timezone = h.get('x-vercel-ip-timezone');
    if (country) geo.country = country;
    if (region) geo.region = region;
    if (city) geo.city = city;
    if (timezone) geo.timezone = timezone;
    return geo;
}

/**
 * Resolve this request's device id from the httpOnly cookie alone. Used by the spend
 * path, which must not trust anything the client just sent.
 */
export async function getRequestDeviceId(): Promise<string | undefined> {
    try {
        const value = (await cookies()).get(DEVICE_COOKIE)?.value;
        return isValidDeviceId(value) ? value : undefined;
    } catch {
        // cookies() throws outside a request scope (e.g. a background task). Not having a
        // device id is always survivable - the per-account and global caps still apply.
        return undefined;
    }
}

/**
 * Called once per page load from the client with whatever id localStorage holds.
 * Returns the canonical id for this browser, which the client then mirrors back into
 * localStorage. The three cases:
 *
 *   cookie present          -> cookie wins; localStorage is repaired from it
 *   no cookie, client id    -> adopt the client's id and re-set the cookie (localStorage
 *                              repairs the cookie, which is the Safari-ITP case)
 *   neither, recent IP match-> inherit the device last seen from this IP (see IP LINKING)
 *   neither, no match       -> mint a new one
 *
 * Best effort throughout: this must never break a page load, so every failure returns an
 * id (or undefined) rather than throwing.
 */
export async function registerDevice(clientDeviceId?: string, userEmail?: string): Promise<string | undefined> {
    let deviceId: string;
    // Set only when this request inherited an id through the IP rule, so the link is
    // recorded once, at the moment it was made.
    let linkedFromIp: string | undefined;
    try {
        const jar = await cookies();
        const fromCookie = jar.get(DEVICE_COOKIE)?.value;
        if (isValidDeviceId(fromCookie)) {
            deviceId = fromCookie;
        } else if (isValidDeviceId(clientDeviceId)) {
            deviceId = clientDeviceId;
        } else {
            const ip = await readClientIp();
            const inherited = ip ? await findRecentDeviceForIp(ip, (await readClientGeo()).city) : undefined;
            if (inherited) {
                deviceId = inherited;
                linkedFromIp = ip;
            } else {
                deviceId = randomUUID();
            }
        }
        jar.set(DEVICE_COOKIE, deviceId, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: DEVICE_COOKIE_MAX_AGE,
        });
    } catch (error: any) {
        console.error(`registerDevice: could not resolve device cookie: ${error?.message ?? error}`);
        return undefined;
    }

    // Record-keeping is best effort and deliberately after the cookie is set: a Firestore
    // hiccup must not cost us the id itself.
    try {
        await touchDevice(deviceId, userEmail, linkedFromIp);
    } catch (error: any) {
        console.error(`registerDevice: could not record device ${deviceId}: ${error?.message ?? error}`);
    }
    return deviceId;
}

/**
 * Upsert `devices/{deviceId}` with the account and IP seen on this request, and stamp the
 * user doc with the device so the spend path can find it without reading cookies deep
 * inside an AI call stack (where there may be no request scope at all).
 *
 * Both lists are deduped and trimmed to the newest N entries. Left to grow, a shared
 * family or library machine would accumulate an unbounded array on a hot document; the
 * pattern a farm makes is visible in a handful of entries anyway.
 */
async function touchDevice(deviceId: string, userEmail?: string, linkedFromIp?: string): Promise<void> {
    if (!db) {
        return;
    }
    const ip = await readClientIp();
    const geo = await readClientGeo();
    const now = Date.now();

    const ref = db.collection(DEVICES).doc(deviceId);
    const snap = await ref.get();
    const existing = snap.data() || {};

    const update: Record<string, any> = {
        deviceId,
        lastSeenAt: FieldValue.serverTimestamp(),
    };
    // createdAt must not be overwritten on later visits; set it only when the doc is new.
    if (!snap.exists) {
        update.createdAt = FieldValue.serverTimestamp();
    }
    if (Object.keys(geo).length > 0) {
        update.geo = geo;
    }
    if (userEmail) {
        update.users = appendCapped(existing.users, userEmail, DEVICE_USER_CAP);
    }
    if (ip) {
        update.ips = appendCapped(existing.ips, ip, DEVICE_IP_CAP);
    }
    if (linkedFromIp) {
        // Objects, not strings: the report needs who, from where and when in one entry.
        const links = Array.isArray(existing.ipLinks) ? existing.ipLinks : [];
        update.ipLinks = [...links, { via: 'ip', ip: linkedFromIp, ...(userEmail ? { userEmail } : {}), at: now }].slice(-DEVICE_LINK_CAP);
    }
    await ref.set(update, {merge: true});

    // The IP's own record of devices, which is what a keyless browser inherits from.
    if (ip) {
        const ipRef = db.collection(IPS).doc(ipDocId(ip));
        const ipSnap = await ipRef.get();
        await ipRef.set({
            ip,
            lastSeenAt: FieldValue.serverTimestamp(),
            devices: appendSighting(ipSnap.data()?.devices, { deviceId, at: now, ...(geo.city ? { city: geo.city } : {}) }, IP_DEVICE_CAP),
        }, {merge: true});
    }

    if (linkedFromIp) {
        logger.warn(`DEVICE_LINKED_BY_IP: keyless browser inherited device ${deviceId}`, {
            deviceId,
            ip: linkedFromIp,
            userEmail,
            city: geo.city,
            otherUsers: (existing.users ?? []).filter((u: string) => u !== userEmail),
        });
    }

    if (userEmail) {
        const userUpdate: Record<string, any> = {
            lastDeviceId: deviceId,
            knownDeviceIds: FieldValue.arrayUnion(deviceId),
        };
        if (ip) {
            userUpdate.lastIp = ip;
            userUpdate.knownIps = FieldValue.arrayUnion(ip);
        }
        if (Object.keys(geo).length > 0) {
            userUpdate.lastGeo = geo;
        }
        if (linkedFromIp) {
            userUpdate.linkedVia = { via: 'ip', ip: linkedFromIp, deviceId, at: now };
        }
        await db.collection('users').doc(userEmail).set(userUpdate, {merge: true});
    }
}
