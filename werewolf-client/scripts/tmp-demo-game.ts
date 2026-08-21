import {db} from "../firebase/server";
import {runAvatarGeneration} from "../app/utils/avatar-generation";

const SOURCE = 'erebus-1785082592766';
const DEMO_ID = 'erebus-avatar-demo';
const OWNER = 'hiper2d@gmail.com';

async function main() {
    const src = await db!.collection('games').doc(SOURCE).get();
    const g = src.data() as any;

    // Full clone so the game page renders the real thing, reset to a clean viewing state.
    await db!.collection('games').doc(DEMO_ID).set({
        ...g,
        ownerEmail: OWNER,
        avatarsStatus: 'pending',
        errorState: null,
        gameStateProcessQueue: [],
        gameStateParamQueue: [],
    });

    // Copy chat messages (story, night-begins, discussion) so scenes have bubbles to ride in.
    const messages = await db!.collection('games').doc(SOURCE).collection('messages').get();
    let batch = db!.batch(); let n = 0;
    for (const m of messages.docs) {
        batch.set(db!.collection('games').doc(DEMO_ID).collection('messages').doc(m.id), m.data());
        if (++n % 400 === 0) { await batch.commit(); batch = db!.batch(); }
    }
    await batch.commit();
    console.log(`cloned game + ${messages.size} messages -> ${DEMO_ID}`);

    const t0 = Date.now();
    const result = await runAvatarGeneration(DEMO_ID, OWNER);
    console.log(`generation: ${((Date.now() - t0) / 1000).toFixed(1)}s, status=${result?.avatarsStatus}`);
}
main().catch(e => { console.error(e); process.exit(1); });
