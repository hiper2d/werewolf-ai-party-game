import { db } from '../firebase/server';

// Scan every game for player-name id fields that have leading/trailing
// whitespace. Cheap: game docs only (no message subcollections).
function dirtyNamesIn(g: any): string[] {
    const out: string[] = [];
    const chk = (label: string, v: any) => {
        if (typeof v === 'string' && v !== v.trim()) out.push(`${label}=${JSON.stringify(v)}`);
    };
    chk('humanPlayerName', g.humanPlayerName);
    (g.bots || []).forEach((b: any, i: number) => chk(`bots[${i}].name`, b?.name));
    (g.votingHistory || []).forEach((vh: any, i: number) => {
        chk(`votingHistory[${i}].eliminatedPlayer`, vh?.eliminatedPlayer);
        Object.keys(vh?.voteCounts || {}).forEach(k => { if (k !== k.trim()) out.push(`votingHistory[${i}].voteCounts KEY=${JSON.stringify(k)}`); });
        (vh?.votes || []).forEach((v: any, j: number) => { chk(`votingHistory[${i}].votes[${j}].voter`, v?.voter); chk(`votingHistory[${i}].votes[${j}].target`, v?.target); });
    });
    return out;
}

async function main() {
    const snap = await db.collection('games').get();
    console.log(`Scanned ${snap.size} games.`);
    let affected = 0;
    snap.forEach(doc => {
        const hits = dirtyNamesIn(doc.data());
        if (hits.length) {
            affected++;
            console.log(`\n${doc.id}  (${(doc.data() as any).gameState})`);
            hits.forEach(h => console.log('  ' + h));
        }
    });
    console.log(`\n${affected} game(s) with dirty player-name ids.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
