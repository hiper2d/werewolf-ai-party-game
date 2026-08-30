import { db } from "../firebase/server";
import * as fs from "fs";

/** Rewrite authored dialogue on one game.
 *  JSON: { story?: string, description?: string, welcomes?: {Name: text} }
 *  Usage: set-dialogue.ts <gameId> <json> */
(async () => {
    const [gameId, jsonPath] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized');
    const spec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const ref = db.collection('games').doc(gameId);
    if (!(await ref.get()).exists) throw new Error(`Game ${gameId} not found`);

    const msgs = await ref.collection('messages').get();
    const batch = db.batch();
    let n = 0;

    for (const doc of msgs.docs) {
        const v: any = doc.data();
        if (spec.story && v.messageType === 'GAME_STORY') {
            batch.update(doc.ref, { msg: { ...v.msg, story: spec.story } });
            console.log(`  GAME_STORY  <- rewritten (${doc.id})`); n++;
        }
        if (spec.welcomes && v.messageType === 'BOT_WELCOME' && spec.welcomes[v.authorName]) {
            batch.update(doc.ref, { msg: { ...v.msg, reply: spec.welcomes[v.authorName] } });
            console.log(`  ${String(v.authorName).padEnd(6)} <- rewritten (${doc.id})`); n++;
        }
    }
    if (spec.description) { batch.update(ref, { description: spec.description }); n++; }
    if (!n) throw new Error('nothing matched - check names/types');
    await batch.commit();
    console.log(`committed ${n} update(s)`);
})();
