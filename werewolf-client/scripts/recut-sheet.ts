/**
 * Re-cuts one round's portraits from the sheet stored on a game or the
 * current user's draft, with the current slicer. Use after a detector fix to
 * repair cuts without a redraw.
 *
 *   npx tsx --env-file=.env scripts/recut-sheet.ts game <gameId> [round=latest]
 *   npx tsx --env-file=.env scripts/recut-sheet.ts draft <ownerEmail> [round=latest]
 */
import {db} from '../firebase/server';
import {firestore} from 'firebase-admin';
import {avatarDraftIdFor} from '../app/utils/avatar-drafts';
import {portraitKeysFor, recutRoundFromSheet} from '../app/utils/avatar-generation';
import {AVATAR_DRAFTS_COLLECTION, AvatarDraft, Game} from '../app/api/game-models';

async function main() {
    const [kind, id, roundArg] = process.argv.slice(2);
    if (!db) throw new Error('Firestore is not initialized');
    if (kind !== 'game' && kind !== 'draft' || !id) throw new Error('Usage: recut-sheet.ts game <gameId> | draft <ownerEmail> [round]');

    const ref = kind === 'game'
        ? db.collection('games').doc(id)
        : db.collection(AVATAR_DRAFTS_COLLECTION).doc(avatarDraftIdFor(id));
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`${kind} ${id} not found`);
    const doc = snap.data() as any;
    const variants = doc.avatarVariants ?? {};
    const keys: string[] = kind === 'game' ? portraitKeysFor(doc as Game) : ((doc as AvatarDraft).keys ?? []);
    const latest = Math.max(...Object.values(variants).map((v: any) => v.n - 1));
    const round = roundArg !== undefined ? parseInt(roundArg, 10) : latest;
    const docExtras = kind === 'draft' ? {expireAt: firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)} : {};

    const cut = await recutRoundFromSheet(ref, variants, keys, round, docExtras);
    console.log(`Re-cut ${cut} of ${keys.length} portraits from ${kind} ${id}, round ${round}`);
}
main().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
