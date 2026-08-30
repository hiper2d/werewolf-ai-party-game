import { db } from "../firebase/server";
import * as fs from "fs";

/** Append authored chat messages to a game (trailer capture).
 *  JSON: [{ id, authorName, messageType, reply | raw, day, recipientName }]
 *  Usage: npx tsx --env-file=.env scripts/add-messages.ts <gameId> <json> */
(async () => {
    const [gameId, jsonPath] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized');
    const spec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const ref = db.collection('games').doc(gameId);
    const game = await ref.get();
    if (!game.exists) throw new Error(`Game ${gameId} not found`);

    // reuse the game's own expiry so these rows age out with everything else
    const any = await ref.collection('messages').doc('000003-kael-to-all').get();
    const expireAt = (any.data() as any)?.expireAt ?? null;

    const batch = db.batch();
    let ts = Date.now();
    let maxN = (game.data() as any).messageCounter ?? 0;

    for (const m of spec) {
        const n = parseInt(String(m.id).slice(0, 6), 10);
        if (n > maxN) maxN = n;
        batch.set(ref.collection('messages').doc(m.id), {
            id: null,
            authorName: m.authorName,
            recipientName: m.recipientName ?? 'ALL',
            messageType: m.messageType,
            day: m.day ?? 1,
            // `raw` writes msg as a plain string, which the chat renders verbatim -
            // that is how the vote-results bars and the elimination reveal are triggered.
            // `story` -> GAME_STORY shape (renders verbatim, no emoji prefix - this is what
            // the game itself uses for vote results). `raw` -> plain string. else BOT reply.
            msg: m.story !== undefined ? { story: m.story }
               : m.raw !== undefined ? m.raw
               : { reply: m.reply },
            cost: 0,
            timestamp: ts++,
            expireAt,
        });
        console.log(`  + ${m.id.padEnd(28)} ${m.authorName} (${m.messageType})`);
    }
    batch.update(ref, { messageCounter: maxN });
    await batch.commit();
    console.log(`committed ${spec.length} message(s), messageCounter -> ${maxN}`);
})();
