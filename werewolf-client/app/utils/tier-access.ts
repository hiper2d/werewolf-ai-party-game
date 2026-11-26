import type {UserTier} from "@/app/api/game-models";

/**
 * Whether an account on `userTier` may open a game created on `gameTier`.
 *
 * The same tier always may. A FREE game also opens for a PAID account (since 2026-11-25): a
 * player whose free credits ran out mid-game tops up, which moves the account to the Paid
 * tier, and must be able to go on with that game. Nothing is lost by it: a free game holds
 * only free-tier models, every call bills at the account's current tier, and the game keeps
 * its free-tier feature limits (`createdWithTier` is unchanged).
 *
 * The other direction stays closed: a PAID game can hold models the free tier may not use.
 */
export function canOpenGameOnTier(gameTier: UserTier | string | undefined, userTier: UserTier | string | undefined): boolean {
    const game = gameTier === 'paid' ? 'paid' : 'free';
    const user = userTier === 'paid' ? 'paid' : 'free';
    return game === user || (game === 'free' && user === 'paid');
}
