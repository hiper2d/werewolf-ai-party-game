/**
 * Reset a game's current night back to VOTE_RESULTS so the player can start it again.
 *
 * Ops repair for a night whose queues were corrupted (e.g. the 2026-09-16 vote race
 * that wrote the vote tally over the night queues). Mirrors replayNightImpl in
 * app/api/night-actions.ts, minus the paid-tier gate: deletes every message from the
 * current day's first NIGHT_BEGINS onward, drops that day's night narrative, clears
 * night results / queues / errorState and sets gameState = VOTE_RESULTS. The client
 * then calls beginNight as usual.
 *
 * Usage (from werewolf-client/, sandbox off):
 *   npx tsx --env-file=.env scripts/reset-night.ts <gameId>          # dry run
 *   npx tsx --env-file=.env scripts/reset-night.ts <gameId> --apply  # write
 */
import { db } from '../firebase/server';

const [gameId, flag] = process.argv.slice(2);
const apply = flag === '--apply';

if (!gameId) {
    console.error('Usage: npx tsx --env-file=.env scripts/reset-night.ts <gameId> [--apply]');
    process.exit(1);
}

(async () => {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);
    const snap = await gameRef.get();
    if (!snap.exists) {
        throw new Error(`Game ${gameId} not found`);
    }
    const game = snap.data()!;
    console.log(`Game ${gameId}: state=${game.gameState} day=${game.currentDay} owner=${game.ownerEmail}`);
    console.log(`  processQueue=${JSON.stringify(game.gameStateProcessQueue)}`);
    console.log(`  paramQueue=${JSON.stringify(game.gameStateParamQueue).slice(0, 120)}`);
    console.log(`  errorState=${game.errorState?.error ?? '-'}`);

    if (game.gameState !== 'NIGHT' && game.gameState !== 'NIGHT_RESULTS') {
        throw new Error(`Refusing: game is in ${game.gameState}, not NIGHT or NIGHT_RESULTS`);
    }

    const messages = gameRef.collection('messages');
    const nightBegins = await messages
        .where('messageType', '==', 'NIGHT_BEGINS')
        .where('day', '==', game.currentDay)
        .orderBy('timestamp', 'asc')
        .limit(1)
        .get();

    let toDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (nightBegins.empty) {
        console.log(`  no NIGHT_BEGINS for day ${game.currentDay}; no messages will be deleted`);
    } else {
        const since = nightBegins.docs[0].data().timestamp;
        toDelete = (await messages.where('timestamp', '>=', since).get()).docs;
        console.log(`  ${toDelete.length} message(s) from ${new Date(since).toISOString()} onward:`);
        for (const d of toDelete) {
            const m = d.data();
            const body = typeof m.msg === 'string' ? m.msg : JSON.stringify(m.msg);
            console.log(`    ${m.messageType} ${m.authorName} -> ${m.recipientName}: ${body.slice(0, 80).replace(/\n/g, ' ')}`);
        }
    }

    const narratives = (game.nightNarratives || []).filter((n: any) => n.day !== game.currentDay);
    const update = {
        gameState: 'VOTE_RESULTS',
        gameStateProcessQueue: [],
        gameStateParamQueue: [],
        nightResults: {},
        resolvedNightState: null,
        nightNarratives: narratives,
        errorState: null,
    };
    console.log(`  update: ${JSON.stringify({ ...update, nightNarratives: `${narratives.length} kept` })}`);

    if (!apply) {
        console.log('\nDry run — pass --apply to write.');
        process.exit(0);
    }

    await Promise.all(toDelete.map(d => d.ref.delete()));
    await gameRef.update(update);
    console.log(`\nDone: deleted ${toDelete.length} message(s), game reset to VOTE_RESULTS.`);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
