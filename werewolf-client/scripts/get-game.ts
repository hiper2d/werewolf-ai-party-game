import { db } from "../firebase/server";

/**
 * Fetch a single game doc by ID — state, theme, errorState, players, voice config.
 * Usage: npx tsx --env-file=.env scripts/get-game.ts <gameId>
 */
async function getGame(gameId: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const doc = await db.collection('games').doc(gameId).get();
    if (!doc.exists) {
        throw new Error(`Game ${gameId} not found`);
    }
    return { id: doc.id, ...doc.data() };
}

const gameId = process.argv[2];
if (!gameId) {
    console.error('Please provide a game ID');
    process.exit(1);
}

getGame(gameId)
    .then(game => console.log(JSON.stringify(game, null, 2)))
    .catch(console.error);
