import type {BrowserSignals} from "@/app/utils/browser-signals";

/**
 * Free credits (since 2026-11-25, docs/plan-growth-roadmap.md track 4): an account gets a
 * ONE-TIME amount of free AI (`users.credits`, USD left) instead of a daily and monthly
 * refill. When it is gone the player tops up a prepaid balance (the Paid tier, as before)
 * or claims a second amount once through the Discord server.
 *
 * Who gets what:
 *   - an account that existed before credits   the sign-up amount, no questions
 *   - a new account                            the sign-up amount, UNLESS it looks like a
 *                                              person who already has an account (below)
 *   - a guest (app/utils/guest.ts)             nothing: a guest has its own trial caps
 *
 * This module is pure (no Firestore, no DOM): the amounts' names, the messages, and the
 * rule that reads the evidence. The reads and writes are in app/api/credits.ts.
 */

/** Status marker `upsertUser` writes on a new account: the sign-up credit is not decided yet. */
export const SIGNUP_CREDIT_PENDING = 'pending';

export type CreditEventKind =
    | 'existing'        // an account from before credits got the sign-up amount
    | 'signup'          // a new account got it
    | 'signup_flagged'  // a new account got it, with one weak sign of a repeat person
    | 'signup_denied'   // a new account did not get it: it looks like a repeat person
    | 'discord'         // the one-time Discord claim
    | 'admin';          // scripts/credits.ts

/** What the refusal says when the free credits are used up. Recognised by `isCreditsSpentError`. */
export const CREDITS_SPENT_MESSAGE = "You've used all your free credits. Get more free on our Discord (ask Marlow with /credits), or add funds on your profile page to keep playing now.";

export function isCreditsSpentError(text: string | undefined | null): boolean {
    return !!text && /used all your free credits/i.test(text);
}

/** The slash command a player types in the Discord server, with their personal code. */
export const DISCORD_CREDITS_COMMAND = 'credits';

// ─── Claim codes ─────────────────────────────────────────────────────────────

/** No 0/O, 1/I/L: a code is read off one screen and typed into another. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_PREFIX = 'WOLF-';

/** A personal claim code, e.g. `WOLF-7KQ2M9XA`. `random` yields integers below `max`. */
export function makeClaimCode(random: (max: number) => number): string {
    let body = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        body += CODE_ALPHABET[random(CODE_ALPHABET.length)];
    }
    return CODE_PREFIX + body;
}

/** What a player typed, as the stored code: upper case, spaces dropped, prefix optional. Null when it cannot be one. */
export function normalizeClaimCode(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = cleaned.startsWith('WOLF') ? cleaned.slice(4) : cleaned;
    if (body.length !== CODE_LENGTH || [...body].some(ch => !CODE_ALPHABET.includes(ch))) return null;
    return CODE_PREFIX + body;
}

// ─── Sibling handles ─────────────────────────────────────────────────────────

const MIN_STEM = 5;

/**
 * The part of an email's name that numbered burner accounts share: lower case, Gmail dots
 * and `+tag` dropped, trailing digits removed (`reqaccv4@gmail.com` → `reqaccv`). Null when
 * the name carries no trailing number or the rest is too short to mean anything (`john12`).
 */
export function handleStem(email: string | undefined | null): string | null {
    if (!email || !email.includes('@')) return null;
    const [rawLocal, domain] = email.toLowerCase().split('@');
    let local = rawLocal.split('+')[0];
    if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
    const stem = local.replace(/\d+$/, '');
    if (stem === local || stem.length < MIN_STEM) return null;
    return stem;
}

// ─── The sign-up rule ────────────────────────────────────────────────────────

/**
 * A machine many honest people share, so its fingerprint cannot name one of them: Apple
 * hardware (one graphics name per chip, a handful of screens), every phone and tablet (two
 * phones of one model are identical), and browsers that hide or invent the graphics card.
 */
export function isGenericMachine(signals: BrowserSignals | undefined | null): boolean {
    if (!signals) return true;
    const renderer = (signals.glRenderer ?? '').toLowerCase();
    if (!renderer) return true;
    if (signals.mobile === true || (signals.touchPoints ?? 0) > 0) return true;
    return /apple|brave|swiftshader|llvmpipe|software|mesa|virtualbox|vmware|parallels|adreno|mali|powervr/.test(renderer);
}

/** What was found about a new account before its sign-up credit is decided. Emails of OTHER accounts only. */
export interface CreditEvidence {
    /** Other accounts on this browser: the same device id (cookie, localStorage, or inherited by the same-IP rule). */
    sameDevice: string[];
    /** Other accounts on another browser id with the same machine fingerprint. */
    sameMachine: string[];
    /** When the newest of those matching browsers was last seen (epoch ms). */
    machineSeenAt?: number;
    /** Many honest people share this machine's fingerprint (`isGenericMachine`). */
    machineGeneric: boolean;
    /** Other accounts seen from this IP address in the last days. */
    sameIp: string[];
    /** Accounts created recently whose name differs from this one only by its trailing number. */
    siblings: string[];
}

export const EMPTY_CREDIT_EVIDENCE: CreditEvidence = {sameDevice: [], sameMachine: [], machineGeneric: true, sameIp: [], siblings: []};

/** A machine-only match counts as a repeat person only this soon after the other browser was seen. */
export const MACHINE_ONLY_WINDOW_MS = 72 * 60 * 60 * 1000;

export type CreditRule = 'device' | 'machine+ip' | 'machine+handle' | 'ip+handle' | 'machine' | 'ip' | 'handle';

export interface CreditDecision {
    /** `deny`: no sign-up credit. `flag`: credit given, one weak sign recorded. `grant`: nothing found. */
    action: 'grant' | 'flag' | 'deny';
    rules: CreditRule[];
    /** The other accounts the evidence points at. */
    linked: string[];
}

/**
 * Does this new account get the sign-up credit? Denied on strong evidence only, because a
 * wrong denial costs a real newcomer their first game and a wrong grant costs the amount once:
 *
 *   - the same browser id as another account                         → deny
 *   - two independent signs together (machine, IP, sibling name)     → deny
 *   - the machine alone, when the machine is a specific one (a PC with a named graphics
 *     card, not Apple hardware or a phone) and the other browser was seen within 72 hours  → deny
 *   - one weak sign alone (a shared IP is a household or a campus, a common laptop is a
 *     common laptop, `maria1990` and `maria1987` are two people)      → grant and flag
 *
 * A denied account can still claim once through Discord, which is also the way out for a
 * real person denied by mistake.
 */
export function decideSignupCredit(evidence: CreditEvidence, now: number = Date.now()): CreditDecision {
    const machine = evidence.sameMachine.length > 0;
    const ip = evidence.sameIp.length > 0;
    const handle = evidence.siblings.length > 0;
    const linked = (...lists: string[][]) => [...new Set(lists.flat())];

    if (evidence.sameDevice.length > 0) {
        return {action: 'deny', rules: ['device'], linked: linked(evidence.sameDevice)};
    }
    const pairs: CreditRule[] = [];
    if (machine && ip) pairs.push('machine+ip');
    if (machine && handle) pairs.push('machine+handle');
    if (ip && handle) pairs.push('ip+handle');
    if (pairs.length > 0) {
        return {action: 'deny', rules: pairs, linked: linked(evidence.sameMachine, evidence.sameIp, evidence.siblings)};
    }
    if (machine) {
        const recent = evidence.machineSeenAt !== undefined && now - evidence.machineSeenAt <= MACHINE_ONLY_WINDOW_MS;
        const specific = !evidence.machineGeneric;
        return {action: specific && recent ? 'deny' : 'flag', rules: ['machine'], linked: linked(evidence.sameMachine)};
    }
    if (ip) return {action: 'flag', rules: ['ip'], linked: linked(evidence.sameIp)};
    if (handle) return {action: 'flag', rules: ['handle'], linked: linked(evidence.siblings)};
    return {action: 'grant', rules: [], linked: []};
}

/** USD with six decimals, never negative: what is left after a spend. */
export function creditsAfterSpend(credits: number, costUSD: number): number {
    return Math.max(0, parseFloat((credits - costUSD).toFixed(6)));
}
