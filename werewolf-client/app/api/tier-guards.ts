'use server';

import {db} from '@/firebase/server';
import {getUserTier} from '@/app/api/user-actions';
import {TierMismatchError} from '@/app/api/errors';
import type {UserTier} from '@/app/api/game-models';

interface EnsureOptions {
    gameTier?: UserTier;
    userTier?: UserTier;
    ownerEmail?: string;
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
    let gameOwnerEmail: string | undefined = options.ownerEmail;
    if (!storedTier || !gameOwnerEmail) {
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            throw new Error('Game not found');
        }
        const gameData = gameDoc.data();
        storedTier = storedTier ?? (gameData?.createdWithTier as UserTier | undefined) ?? 'free';
        gameOwnerEmail = gameOwnerEmail ?? gameData?.ownerEmail;
    }

    // Verify ownership if the game has an owner
    if (gameOwnerEmail && gameOwnerEmail !== userEmail) {
        throw new Error('You do not have access to this game');
    }

    if (storedTier !== currentUserTier) {
        throw new TierMismatchError(gameId, storedTier, currentUserTier);
    }

    return {gameTier: storedTier, userTier: currentUserTier};
}
