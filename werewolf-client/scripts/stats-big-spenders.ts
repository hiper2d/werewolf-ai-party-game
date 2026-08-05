import { db } from "../firebase/server";

/**
 * Users with all-time spend > $N (default 3), with their stored-game counts.
 * Usage: npx tsx --env-file=.env scripts/stats-big-spenders.ts [minUSD=3]
 *
 * Games TTL-expire (~30 days), so "stored games" only counts the last month;
 * spendings are all-time.
 */
async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const minUSD = Number(process.argv[2] || 3);

    const usersSnap = await db.collection('users').get();
    const spenders = usersSnap.docs.map(d => {
        const u = d.data() as any;
        const spendings = (u.spendings || []) as any[];
        const total = spendings.reduce((s, x) => s + Number(x.amountUSD || 0), 0);
        return {
            email: d.id,
            name: u.name || '?',
            tier: u.tier || '?',
            createdAt: u.created_at ? new Date(Number(u.created_at) * 1000).toISOString().slice(0, 10) : '?',
            total,
            months: spendings.map(s => `${s.period}:$${Number(s.amountUSD || 0).toFixed(2)}`).sort().join('  '),
        };
    }).filter(u => u.total > minUSD).sort((a, b) => b.total - a.total);

    // Stored games per owner (last ~30 days due to TTL)
    const gamesSnap = await db.collection('games').get();
    const gamesByOwner: Record<string, { n: number; cost: number; states: Record<string, number> }> = {};
    for (const doc of gamesSnap.docs) {
        const g = doc.data() as any;
        const o = g.ownerEmail || '?';
        gamesByOwner[o] = gamesByOwner[o] || { n: 0, cost: 0, states: {} };
        gamesByOwner[o].n++;
        gamesByOwner[o].cost += Number(g.totalGameCost || 0);
        const st = g.gameState || '?';
        gamesByOwner[o].states[st] = (gamesByOwner[o].states[st] || 0) + 1;
    }

    console.log(`\n=== Users with all-time spend > $${minUSD} (${spenders.length}) ===\n`);
    for (const u of spenders) {
        const g = gamesByOwner[u.email];
        console.log(`$${u.total.toFixed(2)}  tier=${u.tier}  signup=${u.createdAt}  ${u.email}  (${u.name})`);
        console.log(`   months: ${u.months}`);
        console.log(`   stored games (last ~30d): ${g ? g.n : 0}${g ? `, cost $${g.cost.toFixed(2)}, states: ${JSON.stringify(g.states)}` : ''}\n`);
    }
}

main().catch(console.error);
