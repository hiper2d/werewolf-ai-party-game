/**
 * Guest play (docs/plan-growth-roadmap.md, track 1): a visitor with no account can play one
 * ready-made game from the landing page. A guest IS a user as far as the game code is
 * concerned: a `users/{guestEmail}` doc with `guest: true`, a normal session, the free tier.
 * That is the whole point of the shape: every ownership check, spend ledger, cap and report
 * that keys on the user's email works on a guest without a second code path.
 *
 * What a guest gets: ONE starter game, played through day 1 and night 1. The morning of
 * day 2 asks for a sign-in (`GUEST_WALL_MESSAGE`), and signing in moves the game to the
 * account (`claimGuest` in app/api/guest-accounts.ts).
 *
 * Pure helpers only: imported by client components as well as the server.
 */

/** No real mailbox can exist here, so an OAuth account can never collide with a guest. */
export const GUEST_EMAIL_DOMAIN = 'guest.aiwerewolf.net';
export const GUEST_PROVIDER_ID = 'guest';
export const GUEST_DISPLAY_NAME = 'Guest';
/** Pre-filled on the landing page so one click is enough; the visitor can change it. */
export const GUEST_DEFAULT_PLAYER_NAME = 'Traveler';

const GUEST_EMAIL_RE = /^guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@guest\.aiwerewolf\.net$/;

export function guestEmailFor(guestId: string): string {
    return `guest-${guestId.toLowerCase()}@${GUEST_EMAIL_DOMAIN}`;
}

/** True only for the exact shape `guestEmailFor` writes: the value reaches document paths. */
export function isGuestEmail(email: string | null | undefined): boolean {
    return typeof email === 'string' && GUEST_EMAIL_RE.test(email);
}

/** The last day a guest plays: day 1 and the night after it. */
export const GUEST_LAST_DAY = 1;

/** Shown where a guest's game stops. The UI recognizes the refusal by `isGuestWallError`. */
export const GUEST_WALL_MESSAGE = 'Sign in to play day 2. Your game is saved and continues from here.';
export const GUEST_ONLY_STARTER_MESSAGE = 'Sign in to create your own games.';
export const GUEST_ONE_GAME_MESSAGE = 'Sign in to play another story. Your first game stays yours.';
export const GUEST_DEVICE_LIMIT_MESSAGE = 'You have played here before. Sign in to keep playing: it is free.';
export const GUEST_BUDGET_MESSAGE = 'Your free trial of AI is used up. Sign in to keep playing: your game is saved.';
export const GUEST_PAUSED_MESSAGE = 'Free trial play is paused for today. Sign in to keep playing: your game is saved.';

export function isGuestWallError(text: string | undefined | null): boolean {
    return !!text && text.includes(GUEST_WALL_MESSAGE);
}

/** Either guest budget refusal (the guest's own cap, or the shared daily guest budget). */
export function isGuestBudgetError(text: string | undefined | null): boolean {
    return !!text && (text.includes(GUEST_BUDGET_MESSAGE) || text.includes(GUEST_PAUSED_MESSAGE));
}

/** True when a guest may not take this game any further: it has reached day 2. */
export function guestWallReached(game: { currentDay?: number }): boolean {
    return (game.currentDay ?? 1) > GUEST_LAST_DAY;
}

/**
 * Whether this device may mint a NEW guest. It may not once it is known: a guest was made on
 * it before, or an account has signed in on it. A browser that arrives here without its
 * guest cookie on a known device has cleared its cookies (or is a private window, or
 * inherited the device through the same-IP rule in device-actions.ts), and the answer to
 * all of those is the same: sign in (Alex, 2026-11-21). `enabled` 0 turns the rule off.
 */
export function deviceMayMintGuest(device: { lastGuestAt?: number | null; users?: unknown } | undefined | null, enabled: number): boolean {
    if (!(enabled > 0)) return true;
    if (!device) return true;
    return !device.lastGuestAt && !(Array.isArray(device.users) && device.users.length > 0);
}

/** All free spend a guest has ever made: a guest has one game, so no window applies. */
export function guestTotalSpend(spendings: unknown): number {
    if (!Array.isArray(spendings)) return 0;
    return spendings.reduce((sum: number, record: any) => sum + (Number(record?.freeAmountUSD ?? record?.amountUSD) || 0), 0);
}

/** Refuses a guest on an action that belongs to an account (own games, payments, tiers). */
export function assertNotGuest(email: string | null | undefined, message: string = GUEST_ONLY_STARTER_MESSAGE): void {
    if (isGuestEmail(email)) {
        throw new Error(message);
    }
}
