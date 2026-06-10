import { db } from "../firebase/server";

/**
 * Find recent games whose theme/story/description matches a text fragment
 * (Firestore has no full-text search — fetch recent games, filter locally).
 * Usage: npx tsx --env-file=.env scripts/find-games.ts <searchText> [limit=50]
 */
async function findGames(search: string, limit: number) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const snapshot = await db.collection('games')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    const needle = search.toLowerCase();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(g => {
            const haystack = [g.theme, g.description, g.story, g.id]
                .filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(needle);
        })
        .map(g => ({
            id: g.id,
            theme: g.theme,
            gameState: g.gameState,
            createdAt: g.createdAt,
            createdBy: g.createdBy,
            currentDay: g.currentDay,
            errorState: g.errorState ?? null,
        }));
}

const search = process.argv[2];
const limit = parseInt(process.argv[3] || '50', 10);
if (!search) {
    console.error('Please provide search text (matched against theme/story/description)');
    process.exit(1);
}

findGames(search, limit)
    .then(games => {
        console.log(`${games.length} match(es):`);
        console.log(JSON.stringify(games, null, 2));
    })
    .catch(console.error);
