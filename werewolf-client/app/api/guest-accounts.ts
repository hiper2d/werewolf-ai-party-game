import {randomUUID} from "crypto";
import {cookies} from "next/headers";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "@/firebase/server";
import {getRequestDeviceId} from "@/app/api/device-actions";
import {getFreeTierLimits} from "@/app/api/limits-actions";
import {USER_TIERS} from "@/app/api/game-models";
import {deviceMayMintGuest, GUEST_DEVICE_LIMIT_MESSAGE, GUEST_DISPLAY_NAME, guestEmailFor, isGuestEmail} from "@/app/utils/guest";
import {chargeGuestSpend} from "@/app/api/credits";
import {logger} from "@/app/utils/logger";

/**
 * Guest accounts (app/utils/guest.ts): minting one for a visitor, finding the one a browser
 * already has, and handing a guest's game to the account they sign in with.
 *
 * DELIBERATELY NOT a 'use server' module: every export here would otherwise be callable
 * from any browser with any arguments, and `claimGuest` moves games between owners.
 *
 * A guest is recognized by the `ww_guest` cookie (httpOnly, two years): it outlives the
 * 30-day session, so a guest who returns after it expired is signed back into the same
 * account and finds their game. The browser's fingerprint is NOT used for this: two phones
 * of one model can share a fingerprint, and one stranger would open another's game.
 */

const GUEST_COOKIE = 'ww_guest';
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 730;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export interface GuestIdentity {
    id: string;
    email: string;
    name: string;
}

/** The unclaimed guest account with this id, or null. The id is the guest's bearer secret. */
export async function findGuest(guestId: unknown): Promise<GuestIdentity | null> {
    if (!db || typeof guestId !== 'string' || !UUID_RE.test(guestId)) {
        return null;
    }
    const email = guestEmailFor(guestId);
    const snap = await db.collection('users').doc(email).get();
    const data = snap.data();
    if (!snap.exists || data?.guest !== true || data?.claimedBy) {
        return null;
    }
    return { id: guestId.toLowerCase(), email, name: GUEST_DISPLAY_NAME };
}

/** The guest id this browser carries, if any. */
export async function readGuestCookie(): Promise<string | undefined> {
    try {
        const value = (await cookies()).get(GUEST_COOKIE)?.value;
        return value && UUID_RE.test(value) ? value.toLowerCase() : undefined;
    } catch {
        return undefined;
    }
}

export async function clearGuestCookie(): Promise<void> {
    try {
        (await cookies()).delete(GUEST_COOKIE);
    } catch { /* outside a request scope: nothing to clear */ }
}

/**
 * The guest account for this browser: the one its cookie names, or a new one. Throws
 * `GUEST_DEVICE_LIMIT_MESSAGE` when the device is already known (`deviceMayMintGuest`).
 *
 * A new guest is a `users` doc like any other (free tier, empty ledgers) plus `guest: true`,
 * the device it was made on, and the environment that made it: local development writes to
 * the production database, and reports must be able to leave those rows out.
 */
export async function resolveGuestForRequest(): Promise<GuestIdentity> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const existing = await findGuest(await readGuestCookie());
    if (existing) {
        await db.collection('users').doc(existing.email).set({ last_login_timestamp: FieldValue.serverTimestamp() }, { merge: true });
        return existing;
    }

    const now = Date.now();
    const deviceId = await getRequestDeviceId();
    const deviceRef = deviceId ? db.collection('devices').doc(deviceId) : null;
    // GUEST_DEVICE_RULE=off in .env lets a developer start guest after guest on one machine.
    if (deviceRef && process.env.GUEST_DEVICE_RULE !== 'off') {
        const limits = await getFreeTierLimits();
        const device = (await deviceRef.get()).data();
        if (!deviceMayMintGuest(device, limits.guestOncePerDevice)) {
            logger.warn(`GUEST_REFUSED: device ${deviceId} is already known, asked to sign in`, { deviceId, lastGuestAt: device?.lastGuestAt, users: (device?.users ?? []).length });
            throw new Error(GUEST_DEVICE_LIMIT_MESSAGE);
        }
    }

    const id = randomUUID();
    const email = guestEmailFor(id);
    await db.collection('users').doc(email).set({
        email,
        name: GUEST_DISPLAY_NAME,
        guest: true,
        tier: USER_TIERS.FREE,
        env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
        created_at: FieldValue.serverTimestamp(),
        last_login_timestamp: FieldValue.serverTimestamp(),
        spendings: [],
        ...(deviceId ? { lastDeviceId: deviceId, knownDeviceIds: [deviceId] } : {}),
    });
    if (deviceRef) {
        await deviceRef.set({ deviceId, lastGuestAt: now, guests: FieldValue.arrayUnion(email) }, { merge: true });
    }
    (await cookies()).set(GUEST_COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: IS_PRODUCTION,
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE,
    });
    logger.info(`GUEST_CREATED: ${email}`, { userEmail: email, deviceId });
    return { id, email, name: GUEST_DISPLAY_NAME };
}

/**
 * Hand a guest's games to the account that just signed in, and retire the guest. Returns the
 * ids of the games moved (empty when there was nothing to claim). Idempotent: a claimed
 * guest is never claimed again, by anyone.
 *
 * The game takes the account's tier (a game only opens on the tier it was created with);
 * the starter limits keep applying through `starterTemplateId`. The guest doc stays, marked
 * `claimedBy`, so the funnel report can count guests who signed in.
 */
export async function claimGuest(guestId: string | undefined, accountEmail: string | null | undefined): Promise<string[]> {
    if (!db || !guestId || !accountEmail || isGuestEmail(accountEmail)) {
        return [];
    }
    const guest = await findGuest(guestId);
    if (!guest) {
        return [];
    }
    const accountSnap = await db.collection('users').doc(accountEmail).get();
    const tier = accountSnap.data()?.tier === USER_TIERS.PAID ? USER_TIERS.PAID : USER_TIERS.FREE;
    const games = await db.collection('games').where('ownerEmail', '==', guest.email).get();

    const batch = db.batch();
    for (const doc of games.docs) {
        batch.update(doc.ref, { ownerEmail: accountEmail, createdWithTier: tier, guestOwnerEmail: guest.email });
    }
    batch.set(db.collection('users').doc(guest.email), { claimedBy: accountEmail, claimedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection('users').doc(accountEmail), { claimedGuests: FieldValue.arrayUnion(guest.email) }, { merge: true });
    await batch.commit();
    // The trial's AI comes off the account's free credits (app/utils/credits.ts). Best
    // effort: a failure here must not undo the hand-over.
    try {
        await chargeGuestSpend(accountEmail, guest.email);
    } catch (error: any) {
        logger.error(`claimGuest: could not take the guest's spend off the credits: ${error?.message ?? error}`, { userEmail: accountEmail, guestEmail: guest.email });
    }

    const gameIds = games.docs.map(doc => doc.id);
    logger.info(`GUEST_CLAIMED: ${guest.email} signed in, ${gameIds.length} game(s) moved`, { userEmail: accountEmail, guestEmail: guest.email, gameIds });
    return gameIds;
}
