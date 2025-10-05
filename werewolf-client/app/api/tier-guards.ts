'use server';

import {db} from '@/firebase/server';
import {getUserTier} from '@/app/api/user-actions';
import {TierMismatchError} from '@/app/api/errors';
import type {UserTier} from '@/app/api/game-models';

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

    let storedTier: UserTier | undefined = options.gameTier;
    if (!storedTier) {
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            throw new Error('Game not found');
        }
        storedTier = (gameDoc.data()?.createdWithTier as UserTier | undefined) ?? 'free';
    }

    if (storedTier !== currentUserTier) {
        throw new TierMismatchError(gameId, storedTier, currentUserTier);
    }

    return {gameTier: storedTier, userTier: currentUserTier};
}
