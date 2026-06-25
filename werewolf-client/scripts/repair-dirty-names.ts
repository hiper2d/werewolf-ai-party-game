import { db } from '../firebase/server';

/*
 * Normalizes whitespace in player names (which act as identifiers) across a
 * single game. A stray trailing/leading space in a bot name breaks every exact
 * name match (vote targets, GM bot selection, message routing) and can brick a
 * game. This rewrites the id everywhere it is referenced as a FIELD VALUE or
 * OBJECT KEY -- never inside free-text message bodies (those are prose, not ids).
 *
 *   npx tsx --env-file=.env scripts/repair-dirty-names.ts <gameId>          # dry run
 *   npx tsx --env-file=.env scripts/repair-dirty-names.ts <gameId> --apply  # write
 */

type Change = { path: string; from: string; to: string };

const clean = (s: string) => s.trim();

// Trim the keys of a name->value map (e.g. voteCounts). On collision (both
// "X " and "X" present) merge: sum numbers, otherwise keep the existing value.
function trimKeys(obj: Record<string, any>, path: string, changes: Change[]): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        const nk = clean(k);
        if (nk !== k) changes.push({ path: `${path} KEY`, from: k, to: nk });
        if (nk in out) {
            if (typeof out[nk] === 'number' && typeof v === 'number') out[nk] += v;
            // else: keep first; collisions of non-numbers shouldn't happen for ids
        } else {
            out[nk] = v;
        }
    }
    return out;
}

async function main() {
    const gameId = process.argv[2];
    const apply = process.argv.includes('--apply');
    if (!gameId) { console.error('usage: repair-dirty-names.ts <gameId> [--apply]'); process.exit(1); }

    const ref = db.collection('games').doc(gameId);
    const snap = await ref.get();
    if (!snap.exists) { console.error('game not found'); process.exit(1); }
    const g: any = snap.data();
    const changes: Change[] = [];

    // theme
    if (typeof g.theme === 'string' && clean(g.theme) !== g.theme) {
        changes.push({ path: 'theme', from: g.theme, to: clean(g.theme) });
        g.theme = clean(g.theme);
    }
    // humanPlayerName
    if (typeof g.humanPlayerName === 'string' && clean(g.humanPlayerName) !== g.humanPlayerName) {
        changes.push({ path: 'humanPlayerName', from: g.humanPlayerName, to: clean(g.humanPlayerName) });
        g.humanPlayerName = clean(g.humanPlayerName);
    }
    // bots[].name
    (g.bots || []).forEach((b: any, i: number) => {
        if (typeof b.name === 'string' && clean(b.name) !== b.name) {
            changes.push({ path: `bots[${i}].name`, from: b.name, to: clean(b.name) });
            b.name = clean(b.name);
        }
    });
    // votingHistory
    (g.votingHistory || []).forEach((vh: any, i: number) => {
        if (vh.voteCounts && typeof vh.voteCounts === 'object') {
            vh.voteCounts = trimKeys(vh.voteCounts, `votingHistory[${i}].voteCounts`, changes);
        }
        if (typeof vh.eliminatedPlayer === 'string' && clean(vh.eliminatedPlayer) !== vh.eliminatedPlayer) {
            changes.push({ path: `votingHistory[${i}].eliminatedPlayer`, from: vh.eliminatedPlayer, to: clean(vh.eliminatedPlayer) });
            vh.eliminatedPlayer = clean(vh.eliminatedPlayer);
        }
        (vh.votes || []).forEach((v: any, j: number) => {
            for (const f of ['voter', 'target']) {
                if (typeof v[f] === 'string' && clean(v[f]) !== v[f]) {
                    changes.push({ path: `votingHistory[${i}].votes[${j}].${f}`, from: v[f], to: clean(v[f]) });
                    v[f] = clean(v[f]);
                }
            }
        });
    });
    // gameStateParamQueue: entries are either plain names or JSON-encoded tallies/votes
    if (Array.isArray(g.gameStateParamQueue)) {
        g.gameStateParamQueue = g.gameStateParamQueue.map((entry: any, i: number) => {
            if (typeof entry !== 'string') return entry;
            // plain name
            if (clean(entry) !== entry && !entry.trim().startsWith('{') && !entry.trim().startsWith('[')) {
                changes.push({ path: `gameStateParamQueue[${i}]`, from: entry, to: clean(entry) });
                return clean(entry);
            }
            // JSON tally/vote payload -> trim its keys/string values
            try {
                const parsed = JSON.parse(entry);
                const before = JSON.stringify(parsed);
                const fixed = deepFixJson(parsed, `gameStateParamQueue[${i}]`, changes);
                const after = JSON.stringify(fixed);
                return after !== before ? after : entry;
            } catch { return entry; }
        });
    }

    // Messages: id fields only (authorName, recipientName) -- never msg prose.
    const msgsSnap = await ref.collection('messages').get();
    const msgUpdates: { id: string; field: string; from: string; to: string }[] = [];
    msgsSnap.forEach(doc => {
        const m = doc.data();
        for (const f of ['authorName', 'recipientName']) {
            const v = m[f];
            if (typeof v === 'string' && clean(v) !== v) {
                msgUpdates.push({ id: doc.id, field: f, from: v, to: clean(v) });
            }
        }
    });

    console.log(`=== Game doc changes (${changes.length}) ===`);
    changes.forEach(c => console.log(`  ${c.path}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`));
    console.log(`\n=== Message id-field changes (${msgUpdates.length}) ===`);
    msgUpdates.forEach(u => console.log(`  ${u.id}.${u.field}: ${JSON.stringify(u.from)} -> ${JSON.stringify(u.to)}`));

    if (!apply) {
        console.log('\nDRY RUN -- re-run with --apply to write these changes.');
        return;
    }
    if (changes.length === 0 && msgUpdates.length === 0) {
        console.log('\nNothing to change.');
        return;
    }

    // Write game doc (only the fields we touched)
    if (changes.length > 0) {
        await ref.update({
            theme: g.theme,
            humanPlayerName: g.humanPlayerName,
            bots: g.bots,
            votingHistory: g.votingHistory,
            gameStateParamQueue: g.gameStateParamQueue,
        });
    }
    // Write messages in batches
    let batch = db.batch();
    let n = 0;
    for (const u of msgUpdates) {
        batch.update(ref.collection('messages').doc(u.id), { [u.field]: u.to });
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400 !== 0) await batch.commit();
    console.log(`\nAPPLIED: ${changes.length} game-doc fields, ${msgUpdates.length} message id-fields.`);
}

function deepFixJson(node: any, path: string, changes: Change[]): any {
    if (typeof node === 'string') return clean(node) !== node ? clean(node) : node;
    if (Array.isArray(node)) return node.map((v, i) => deepFixJson(v, `${path}[${i}]`, changes));
    if (node && typeof node === 'object') {
        const trimmed = trimKeys(node, path, changes);
        for (const k of Object.keys(trimmed)) trimmed[k] = deepFixJson(trimmed[k], `${path}.${k}`, changes);
        return trimmed;
    }
    return node;
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
