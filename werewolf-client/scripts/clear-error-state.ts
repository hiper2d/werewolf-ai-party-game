import { db } from "../firebase/server";

/**
 * Clear a game's recoverable errorState so its auto-processing effects resume.
 * Mirrors clearGameErrorState in app/api/game-actions.ts (sets errorState: null).
 * Usage: npx tsx --env-file=.env scripts/clear-error-state.ts <gameId>
 */
async function clearErrorState(gameId: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);
    const doc = await gameRef.get();
    if (!doc.exists) {
        throw new Error(`Game ${gameId} not found`);
    }
    const data = doc.data() as any;
    console.log('Before:', JSON.stringify({
        gameState: data.gameState,
        gameStateProcessQueue: data.gameStateProcessQueue,
        errorState: data.errorState,
    }, null, 2));

    if (!data.errorState) {
        console.log('No errorState set — nothing to clear.');
        return;
    }

    await gameRef.update({ errorState: null });
    console.log(`✅ Cleared errorState for game ${gameId}.`);
}

const gameId = process.argv[2];
if (!gameId) {
    console.error('Please provide a game ID');
    process.exit(1);
}

clearErrorState(gameId)
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
