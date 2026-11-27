'use server';

import {db} from '@/firebase/server';
import {getUserTier} from '@/app/api/user-actions';
import {TierMismatchError} from '@/app/api/errors';
import {canOpenGameOnTier} from '@/app/utils/tier-access';
import type {UserTier} from '@/app/api/game-models';
import {seatFor} from '@/app/api/game-seats';

interface EnsureOptions {
    gameTier?: UserTier;
    userTier?: UserTier;
}

export async function ensureUserCanAccessGame(
    gameId: string,
    userEmail: string,
    options: EnsureOptions = {}
): Promise<{gameTier: UserTier; userTier: UserTier}> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const currentUserTier = options.userTier ?? await getUserTier(userEmail);

    const gameDoc = await db.collection('games').doc(gameId).get();
    if (!gameDoc.exists) {
        throw new Error('Game not found');
    }
    const gameData = gameDoc.data();
    // Coerce rather than cast: a stray legacy value (e.g. the retired 'api' tier)
    // must compare as 'free', not throw an unresolvable TierMismatchError.
    const storedTier: UserTier = options.gameTier ?? (gameData?.createdWithTier === 'paid' ? 'paid' : 'free');

    // The caller must hold a seat at this table (app/api/game-seats.ts).
    const seat = seatFor({
        ownerEmail: gameData?.ownerEmail || '',
        humanPlayerName: gameData?.humanPlayerName,
        seats: gameData?.seats,
    }, userEmail);
    if (!seat) {
        throw new Error('You do not have access to this game');
    }

    if (!canOpenGameOnTier(storedTier, currentUserTier)) {
        throw new TierMismatchError(gameId, storedTier, currentUserTier);
    }

    return {gameTier: storedTier, userTier: currentUserTier};
}
