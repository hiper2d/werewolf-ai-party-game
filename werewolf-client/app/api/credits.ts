import {randomInt} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "@/firebase/server";
import {getFreeTierLimits} from "@/app/api/limits-actions";
import {getRequestDeviceId} from "@/app/api/device-actions";
import {guestTotalSpend, isGuestEmail} from "@/app/utils/guest";
import {isWeakSignalVector, StoredFingerprint} from "@/app/utils/browser-signals";
import {
    CreditDecision, CreditEventKind, CreditEvidence, creditsAfterSpend, decideSignupCredit, handleStem,
    isGenericMachine, makeClaimCode, normalizeClaimCode, SIGNUP_CREDIT_PENDING,
} from "@/app/utils/credits";
import {logger} from "@/app/utils/logger";

/**
 * Free credits, the server side (rules and wording: app/utils/credits.ts).
 *
 * DELIBERATELY NOT a 'use server' module: every export here gives or takes money and would
 * otherwise be callable from any browser with any arguments. Browser-facing calls are in
 * app/api/credit-actions.ts, which reads the account from the session.
 *
 * On the user doc:
 *   credits               USD of free AI left. Absent = not decided yet.
 *   signupCreditStatus    'pending' (written at sign-up) → 'granted' | 'flagged' | 'denied';
 *                         'existing' for an account from before credits
 *   signupCreditInfo      {at, amountUSD, rules, linked}: why
 *   discordCredit         {at, amountUSD, discordUserId, discordUsername}: the one Discord claim
 *   discordClaimCode      the personal code typed into Discord
 *   handleStem            the name without its trailing number (`handleStem`), for the sibling rule
 *   guestSpendCharged     guests whose trial spend was already taken off the credits
 *
 * Collections: `creditEvents` (one flat row per grant, denial or claim, 180 days: what
 * Marlow's digest reads), `creditClaimCodes/{code}` → the account, `discordClaims/{discord
 * user id}` → the account that used that Discord user's one claim.
 */

export const CREDIT_EVENTS_COLLECTION = 'creditEvents';
const CLAIM_CODES = 'creditClaimCodes';
const DISCORD_CLAIMS = 'discordClaims';
const CREDIT_EVENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** A shared IP counts as a sign for this long: addresses are handed to someone else. */
const SAME_IP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Two numbered names are siblings only when both accounts are this new to each other. */
const SIBLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function round6(n: number): number {
    return parseFloat((Number(n) || 0).toFixed(6));
}

function millisOf(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return undefined;
}

function environment(): string {
    return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

interface CreditEventInput {
    email: string;
    kind: CreditEventKind;
    amountUSD: number;
    creditsAfter: number;
    rules?: string[];
    linked?: string[];
    deviceId?: string;
    ip?: string;
    city?: string;
    discordUserId?: string;
    discordUsername?: string;
    note?: string;
}

/** One row per grant, denial or claim. Best effort: the money is already on the user doc. */
async function writeCreditEvent(event: CreditEventInput): Promise<void> {
    if (!db) return;
    const now = Date.now();
    const row: Record<string, any> = {env: environment(), createdAt: new Date(now), expireAt: new Date(now + CREDIT_EVENT_TTL_MS)};
    for (const [key, value] of Object.entries(event)) {
        if (value !== undefined) row[key] = value;
    }
    try {
        await db.collection(CREDIT_EVENTS_COLLECTION).add(row);
    } catch (error: any) {
        logger.error(`creditEvents row not written: ${error?.message ?? error}`, {userEmail: event.email, kind: event.kind});
    }
}

/** Accounts on a device doc, without guests and without the account being judged. */
function accountsOn(device: Record<string, any> | undefined, self: string): string[] {
    const users: unknown[] = Array.isArray(device?.users) ? device!.users : [];
    return users.filter((u): u is string => typeof u === 'string' && u !== self && !isGuestEmail(u));
}

function newestFingerprint(device: Record<string, any> | undefined): StoredFingerprint | undefined {
    const list: StoredFingerprint[] = Array.isArray(device?.fingerprints) ? device!.fingerprints : [];
    return [...list].sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))[0];
}

async function readDevices(ids: string[]): Promise<Map<string, Record<string, any>>> {
    const out = new Map<string, Record<string, any>>();
    if (!db || ids.length === 0) return out;
    const snaps = await db.getAll(...ids.map(id => db!.collection('devices').doc(id)));
    for (const snap of snaps) {
        if (snap.exists) out.set(snap.id, snap.data() || {});
    }
    return out;
}

/**
 * What points from this new account at accounts that existed before it: the same browser,
 * the same machine on another browser id, the same IP in the last week, a sibling name.
 * Reads only; every lookup that fails counts as nothing found (a failed read must not cost
 * a newcomer their credit).
 */
export async function gatherCreditEvidence(email: string, user: Record<string, any>, now: number = Date.now()): Promise<CreditEvidence & {deviceId?: string; ip?: string; city?: string}> {
    const evidence: CreditEvidence & {deviceId?: string; ip?: string; city?: string} = {
        sameDevice: [], sameMachine: [], machineGeneric: true, sameIp: [], siblings: [],
    };
    if (!db) return evidence;
    const deviceId: string | undefined = typeof user.lastDeviceId === 'string' ? user.lastDeviceId : undefined;
    const ip: string | undefined = typeof user.lastIp === 'string' ? user.lastIp : undefined;
    evidence.deviceId = deviceId;
    evidence.ip = ip;
    evidence.city = user.lastGeo?.city;

    try {
        const device = deviceId ? (await db.collection('devices').doc(deviceId).get()).data() : undefined;
        evidence.sameDevice = accountsOn(device, email);

        const fingerprint = newestFingerprint(device);
        if (fingerprint && !isWeakSignalVector(fingerprint.signals)) {
            evidence.machineGeneric = isGenericMachine(fingerprint.signals);
            const fp = (await db.collection('fingerprints').doc(fingerprint.machineHash).get()).data();
            const sightings: {deviceId: string; at: number}[] = (Array.isArray(fp?.devices) ? fp!.devices : [])
                .filter((s: any) => s && typeof s.deviceId === 'string' && s.deviceId !== deviceId);
            const devices = await readDevices([...new Set(sightings.map(s => s.deviceId))]);
            for (const sighting of sightings) {
                const accounts = accountsOn(devices.get(sighting.deviceId), email);
                if (accounts.length === 0) continue;
                evidence.sameMachine.push(...accounts);
                evidence.machineSeenAt = Math.max(evidence.machineSeenAt ?? 0, sighting.at ?? 0);
            }
        }

        if (ip) {
            const ipDoc = (await db.collection('ips').doc(ip.replace(/\//g, '_')).get()).data();
            const sightings: {deviceId: string; at: number}[] = (Array.isArray(ipDoc?.devices) ? ipDoc!.devices : [])
                .filter((s: any) => s && typeof s.deviceId === 'string' && s.deviceId !== deviceId && now - (s.at ?? 0) <= SAME_IP_WINDOW_MS);
            const devices = await readDevices([...new Set(sightings.map(s => s.deviceId))]);
            for (const sighting of sightings) {
                evidence.sameIp.push(...accountsOn(devices.get(sighting.deviceId), email));
            }
        }

        const stem = handleStem(email);
        if (stem) {
            const siblings = await db.collection('users').where('handleStem', '==', stem).limit(20).get();
            evidence.siblings = siblings.docs.map(doc => doc.id).filter(id => id !== email && !isGuestEmail(id));
        }

        // Only accounts that were there BEFORE this one are evidence (two accounts must not
        // deny each other), and a sibling name only while both are new.
        const mine = millisOf(user.created_at) ?? now;
        const candidates = [...new Set([...evidence.sameDevice, ...evidence.sameMachine, ...evidence.sameIp, ...evidence.siblings])];
        const createdAt = new Map<string, number>();
        if (candidates.length > 0) {
            const snaps = await db.getAll(...candidates.map(c => db!.collection('users').doc(c)));
            for (const snap of snaps) {
                const created = snap.exists ? millisOf(snap.data()?.created_at) : undefined;
                // An account with no creation time is an old one: it was there before.
                if (snap.exists) createdAt.set(snap.id, created ?? 0);
            }
        }
        const earlier = (list: string[]) => [...new Set(list)].filter(e => createdAt.has(e) && createdAt.get(e)! < mine);
        evidence.sameDevice = earlier(evidence.sameDevice);
        evidence.sameMachine = earlier(evidence.sameMachine).filter(e => !evidence.sameDevice.includes(e));
        evidence.sameIp = earlier(evidence.sameIp).filter(e => !evidence.sameDevice.includes(e));
        evidence.siblings = earlier(evidence.siblings).filter(e => mine - createdAt.get(e)! <= SIBLING_WINDOW_MS);
        if (evidence.sameMachine.length === 0) delete evidence.machineSeenAt;
    } catch (error: any) {
        logger.error(`gatherCreditEvidence failed for a new account, treating as nothing found: ${error?.message ?? error}`, {userEmail: email});
        return {sameDevice: [], sameMachine: [], machineGeneric: true, sameIp: [], siblings: [], deviceId, ip, city: evidence.city};
    }
    return evidence;
}

/** What the trial games of the guests this account took over cost, for those not charged yet. */
async function unchargedGuestSpend(user: Record<string, any>): Promise<{spendUSD: number; guests: string[]}> {
    const claimed: string[] = Array.isArray(user.claimedGuests) ? user.claimedGuests : [];
    const charged: string[] = Array.isArray(user.guestSpendCharged) ? user.guestSpendCharged : [];
    const guests = claimed.filter(g => isGuestEmail(g) && !charged.includes(g));
    if (!db || guests.length === 0) return {spendUSD: 0, guests: []};
    const snaps = await db.getAll(...guests.map(g => db!.collection('users').doc(g)));
    const spendUSD = snaps.reduce((sum, snap) => sum + (snap.exists ? guestTotalSpend(snap.data()?.spendings) : 0), 0);
    return {spendUSD: round6(spendUSD), guests};
}

/**
 * The account's free credits, deciding the sign-up credit first when it has not been
 * decided: an account from before credits gets the amount, a new one gets it unless it
 * looks like a repeat person (`decideSignupCredit`). The trial spend of a guest the account
 * took over comes off the amount. Returns undefined for a guest, a missing account, or with
 * credits switched off.
 *
 * Safe to call from several requests at once: the write re-reads the account in a
 * transaction and only the first one decides.
 */
export async function ensureCredits(email: string | null | undefined): Promise<number | undefined> {
    if (!db || !email || isGuestEmail(email)) return undefined;
    const userRef = db.collection('users').doc(email);
    const snap = await userRef.get();
    if (!snap.exists) return undefined;
    const user = snap.data() || {};
    if (user.guest === true) return undefined;
    if (typeof user.credits === 'number') return user.credits;

    const limits = await getFreeTierLimits();
    if (!limits.creditsOn) return undefined;

    const isNew = user.signupCreditStatus === SIGNUP_CREDIT_PENDING;
    // Asked before the first page load stamped the browser on the account (a server-rendered
    // page, the spend guard): the request's own device cookie says which browser this is.
    // Outside a request (a script) there is none, and the account's stored one stands.
    if (isNew && typeof user.lastDeviceId !== 'string') {
        const requestDevice = await getRequestDeviceId();
        if (requestDevice) user.lastDeviceId = requestDevice;
    }
    const evidence = isNew ? await gatherCreditEvidence(email, user) : undefined;
    const decision: CreditDecision = evidence ? decideSignupCredit(evidence) : {action: 'grant', rules: [], linked: []};
    const guest = await unchargedGuestSpend(user);
    const amountUSD = decision.action === 'deny' ? 0 : Math.max(0, round6(limits.signupCreditUSD - guest.spendUSD));
    const status = !isNew ? 'existing' : decision.action === 'deny' ? 'denied' : decision.action === 'flag' ? 'flagged' : 'granted';

    const decided = await db.runTransaction(async (transaction) => {
        const fresh = (await transaction.get(userRef)).data() || {};
        if (typeof fresh.credits === 'number') return {credits: fresh.credits as number, wrote: false};
        transaction.update(userRef, {
            credits: amountUSD,
            signupCreditStatus: status,
            signupCreditInfo: {at: Date.now(), amountUSD, rules: decision.rules, linked: decision.linked},
            ...(guest.guests.length > 0 ? {guestSpendCharged: FieldValue.arrayUnion(...guest.guests)} : {}),
            ...(handleStem(email) ? {handleStem: handleStem(email)} : {}),
        });
        return {credits: amountUSD, wrote: true};
    });
    if (!decided.wrote) return decided.credits;

    const kind: CreditEventKind = status === 'existing' ? 'existing' : status === 'denied' ? 'signup_denied' : status === 'flagged' ? 'signup_flagged' : 'signup';
    await writeCreditEvent({
        email, kind, amountUSD, creditsAfter: amountUSD, rules: decision.rules, linked: decision.linked,
        deviceId: evidence?.deviceId ?? user.lastDeviceId, ip: evidence?.ip ?? user.lastIp, city: evidence?.city ?? user.lastGeo?.city,
        ...(guest.spendUSD > 0 ? {note: `guest trial $${guest.spendUSD} taken off`} : {}),
    });
    if (status === 'denied' || status === 'flagged') {
        // warn, with a fixed tag: Marlow's log watch reads these as it reads FREE_SPEND_LIMIT.
        logger.warn(`SIGNUP_CREDIT_${status.toUpperCase()}: ${email} (${decision.rules.join(', ')})`, {
            userEmail: email, rules: decision.rules, linked: decision.linked, deviceId: evidence?.deviceId ?? null,
        });
    } else {
        logger.info(`SIGNUP_CREDIT_GRANTED: ${email} $${amountUSD} (${status})`, {userEmail: email, amountUSD, status});
    }
    return amountUSD;
}

/**
 * Add credits to an account by hand (scripts/credits.ts) or by the Discord claim. A
 * negative amount takes credits away, never below zero. Decides the sign-up credit first,
 * so a grant never stands in for it. Returns the credits after.
 */
export async function addCredits(email: string, amountUSD: number, kind: CreditEventKind, extra: Partial<CreditEventInput> = {}): Promise<number> {
    if (!db) throw new Error('Firestore is not initialized');
    if (isGuestEmail(email)) throw new Error('A guest has no credits');
    await ensureCredits(email);
    const userRef = db.collection('users').doc(email);
    const after = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(userRef);
        if (!snap.exists) throw new Error('User not found');
        const next = Math.max(0, round6((Number(snap.data()?.credits) || 0) + amountUSD));
        transaction.update(userRef, {credits: next});
        return next;
    });
    await writeCreditEvent({...extra, email, kind, amountUSD, creditsAfter: after});
    logger.info(`CREDITS_ADDED: ${email} ${amountUSD >= 0 ? '+' : ''}${amountUSD} (${kind})`, {userEmail: email, amountUSD, kind});
    return after;
}

/**
 * A guest this account just took over (`claimGuest`): the trial's spend comes off credits
 * that were already decided. An account whose sign-up credit is still open gets it taken off
 * in `ensureCredits` instead. Best effort, once per guest.
 */
export async function chargeGuestSpend(accountEmail: string, guestEmail: string): Promise<void> {
    if (!db || isGuestEmail(accountEmail) || !isGuestEmail(guestEmail)) return;
    const userRef = db.collection('users').doc(accountEmail);
    const guestSnap = await db.collection('users').doc(guestEmail).get();
    const spendUSD = guestSnap.exists ? round6(guestTotalSpend(guestSnap.data()?.spendings)) : 0;
    await db.runTransaction(async (transaction) => {
        const user = (await transaction.get(userRef)).data() || {};
        const charged: string[] = Array.isArray(user.guestSpendCharged) ? user.guestSpendCharged : [];
        if (typeof user.credits !== 'number' || charged.includes(guestEmail)) return;
        transaction.update(userRef, {
            credits: creditsAfterSpend(user.credits, spendUSD),
            guestSpendCharged: FieldValue.arrayUnion(guestEmail),
        });
    });
}

// ─── The Discord claim ───────────────────────────────────────────────────────

/** The account's personal claim code, made on first ask. */
export async function getClaimCode(email: string): Promise<string> {
    if (!db) throw new Error('Firestore is not initialized');
    if (isGuestEmail(email)) throw new Error('Sign in to get a code');
    const userRef = db.collection('users').doc(email);
    const existing = (await userRef.get()).data()?.discordClaimCode;
    if (typeof existing === 'string' && normalizeClaimCode(existing)) return existing;
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeClaimCode(randomInt);
        try {
            // create() fails when the code is taken, which is the uniqueness check.
            await db.collection(CLAIM_CODES).doc(code).create({email, createdAt: new Date()});
        } catch {
            continue;
        }
        await userRef.set({discordClaimCode: code}, {merge: true});
        return code;
    }
    throw new Error('Could not make a claim code');
}

export type DiscordClaimResult =
    | {ok: true; amountUSD: number; credits: number}
    | {ok: false; reason: 'off' | 'bad_code' | 'account_claimed' | 'discord_claimed'};

/**
 * The one-time Discord claim: a member of the Discord server types their personal code and
 * the account behind it gets `discordCreditUSD`. Once per game account AND once per Discord
 * user, both checked in one transaction, so a second game account needs a second Discord
 * user and a second Discord user gains nothing on the same game account.
 */
export async function claimDiscordCredit(input: {code: unknown; discordUserId: string; discordUsername?: string}): Promise<DiscordClaimResult> {
    if (!db) throw new Error('Firestore is not initialized');
    const limits = await getFreeTierLimits();
    if (!limits.creditsOn || !(limits.discordCreditUSD > 0)) return {ok: false, reason: 'off'};
    const code = normalizeClaimCode(input.code);
    if (!code || !/^\d{5,25}$/.test(input.discordUserId)) return {ok: false, reason: 'bad_code'};
    const codeSnap = await db.collection(CLAIM_CODES).doc(code).get();
    const email: string | undefined = codeSnap.data()?.email;
    if (!codeSnap.exists || !email || isGuestEmail(email)) return {ok: false, reason: 'bad_code'};

    await ensureCredits(email);
    const amountUSD = limits.discordCreditUSD;
    const userRef = db.collection('users').doc(email);
    const claimRef = db.collection(DISCORD_CLAIMS).doc(input.discordUserId);
    const result = await db.runTransaction<DiscordClaimResult>(async (transaction) => {
        const [userSnap, claimSnap] = await Promise.all([transaction.get(userRef), transaction.get(claimRef)]);
        if (!userSnap.exists) return {ok: false, reason: 'bad_code'};
        const user = userSnap.data() || {};
        if (user.discordCredit) return {ok: false, reason: 'account_claimed'};
        if (claimSnap.exists) return {ok: false, reason: 'discord_claimed'};
        const credits = round6((Number(user.credits) || 0) + amountUSD);
        const stamp = {at: Date.now(), amountUSD, discordUserId: input.discordUserId, ...(input.discordUsername ? {discordUsername: input.discordUsername} : {})};
        transaction.update(userRef, {credits, discordCredit: stamp});
        transaction.set(claimRef, {email, ...stamp});
        return {ok: true, amountUSD, credits};
    });
    if (result.ok) {
        await writeCreditEvent({
            email, kind: 'discord', amountUSD, creditsAfter: result.credits,
            discordUserId: input.discordUserId, discordUsername: input.discordUsername,
        });
        logger.info(`DISCORD_CREDIT_CLAIMED: ${email} +$${amountUSD}`, {userEmail: email, amountUSD, discordUserId: input.discordUserId});
    }
    return result;
}
