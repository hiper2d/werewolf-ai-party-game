'use server'

import {auth} from "@/auth";
import {AvatarGenerationResult, runAvatarGeneration} from "@/app/utils/avatar-generation";

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
