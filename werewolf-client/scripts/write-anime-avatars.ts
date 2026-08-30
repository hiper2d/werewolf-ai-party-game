import { db } from "../firebase/server";
import * as fs from "fs";

/** Overwrite a single game's avatar docs with externally-produced art.
 *  Usage: npx tsx --env-file=.env scripts/write-anime-avatars.ts <gameId> <json> */
(async () => {
    const [gameId, jsonPath] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized');
    const imgs: Record<string, string> = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const gameRef = db.collection('games').doc(gameId);
    if (!(await gameRef.get()).exists) throw new Error(`Game ${gameId} not found`);

    const batch = db.batch();
    for (const [key, data] of Object.entries(imgs)) {
        batch.set(gameRef.collection('avatars').doc(key), {
            data, mime: 'image/jpeg', createdAt: Date.now(),
        });
    }
    batch.update(gameRef, { avatarsStatus: 'ready', avatarsVersion: Date.now() });
    await batch.commit();
    console.log(`wrote ${Object.keys(imgs).length} avatars to ${gameId}:`, Object.keys(imgs).join(', '));
})();
