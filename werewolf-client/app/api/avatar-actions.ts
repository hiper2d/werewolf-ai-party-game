'use server'

import {auth} from "@/auth";
import {AvatarGenerationResult, runAvatarGeneration, runAvatarRegeneration, selectAvatarVariantFor} from "@/app/utils/avatar-generation";
import {FREE_TIER_AVATAR_REGENS, USER_TIERS} from "@/app/api/game-models";
import {getUserBalance, getUserTier} from "@/app/api/user-actions";

/**
 * Generates the full themed avatar set for a game in ONE image-model call:
 * a portrait grid (bots + human + Game Master), sliced into per-character
 * avatars stored as JPEG in games/{id}/avatars/{key} and served by
 * /api/games/[id]/avatars/[key].
 *
 * Triggered from the game page when game.avatarsStatus === 'pending' (set by
 * createGame). Games created before this feature have no avatarsStatus and are
 * never processed — their UI falls back to the initial-letter avatars.
 * Idempotent: a transaction flips pending → generating, so concurrent calls
 * (two tabs, double effect) no-op.
 */
export async function generateGameAvatars(gameId: string): Promise<AvatarGenerationResult | null> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    return runAvatarGeneration(gameId, session.user.email);
}

/**
 * Owner-triggered portrait reroll: one more grid drawn for the whole cast,
 * appended to each character's candidates. One image call costs the same
 * whether it draws one cell or sixteen, so a reroll always redraws everyone —
 * the player looks at the one face they were unhappy with and the rest simply
 * gain an alternate they can ignore.
 *
 * Free-tier games get FREE_TIER_AVATAR_REGENS rerolls; paid games are
 * unlimited and billed like every other image (cost + markup off the balance).
 * The cap is enforced inside the claim transaction too, so two tabs can't spend
 * a free game's single reroll twice.
 *
 * Returns null when the reroll can't start: not the owner, avatars not ready,
 * one already running, or the free allowance is spent.
 */
export async function regenerateGameAvatars(gameId: string): Promise<AvatarGenerationResult | null> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    const tier = await getUserTier(session.user.email);
    if (tier === USER_TIERS.PAID) {
        const balance = await getUserBalance(session.user.email);
        if (balance <= 0) {
            throw new Error('Insufficient balance. Please add funds on your profile page to reroll portraits.');
        }
    }
    const maxRegens = tier === USER_TIERS.PAID ? Number.MAX_SAFE_INTEGER : FREE_TIER_AVATAR_REGENS;
    return runAvatarRegeneration(gameId, session.user.email, maxRegens);
}

/**
 * Shows a different candidate for one character. Copies that candidate into
 * games/{id}/avatars/{key} — the doc the image route and every other reader
 * already serve — and bumps only that key's cache-buster.
 */
export async function selectAvatarVariant(gameId: string, key: string, index: number) {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    return selectAvatarVariantFor(gameId, session.user.email, key, index);
}
