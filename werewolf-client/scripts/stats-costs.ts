import { db } from "../firebase/server";

/**
 * Cost stats across all games and all users.
 * Usage: npx tsx --env-file=.env scripts/stats-costs.ts
 *
 * Games TTL-expire (~30 days), so per-game stats cover roughly the last month.
 * User spendings (users/{email}.spendings) persist for all time.
 */
async function main() {
    if (!db) throw new Error('Firestore is not initialized');

    // ---- Per-game costs ----
    const gamesSnap = await db.collection('games').get();
    const games = gamesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const withCost = games
        .map(g => ({ id: g.id, cost: Number(g.totalGameCost || 0), tier: g.createdWithTier || '?', owner: g.ownerEmail || '?', state: g.gameState }))
        .filter(g => g.cost > 0)
        .sort((a, b) => b.cost - a.cost);

    const totalGameCost = withCost.reduce((s, g) => s + g.cost, 0);
    console.log(`\n=== Per-game cost (games still stored: ${games.length}, with cost>0: ${withCost.length}) ===`);
    console.log(`Total:   $${totalGameCost.toFixed(2)}`);
    console.log(`Average: $${(totalGameCost / withCost.length).toFixed(4)}`);
    console.log(`Max:     $${withCost[0].cost.toFixed(4)}  (${withCost[0].id}, tier=${withCost[0].tier}, state=${withCost[0].state})`);
    const sorted = withCost.map(g => g.cost).sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    console.log(`Median:  $${pct(0.5).toFixed(4)}   p90: $${pct(0.9).toFixed(4)}   p99: $${pct(0.99).toFixed(4)}`);
    console.log(`Top 10 games by cost:`);
    for (const g of withCost.slice(0, 10)) {
        console.log(`  $${g.cost.toFixed(4)}  tier=${g.tier}  state=${g.state}  ${g.id}`);
    }

    // ---- Per-user costs (all-time, from monthly spendings) ----
    const usersSnap = await db.collection('users').get();
    type U = { email: string; tier: string; total: number; months: Record<string, number> };
    const users: U[] = usersSnap.docs.map(d => {
        const u = d.data() as any;
        const months: Record<string, number> = {};
        for (const s of (u.spendings || [])) months[s.period] = Number(s.amountUSD || 0);
        return { email: d.id, tier: u.tier || '?', total: Object.values(months).reduce((a, b) => a + b, 0), months };
    });
    const spenders = users.filter(u => u.total > 0).sort((a, b) => b.total - a.total);
    const totalUserSpend = spenders.reduce((s, u) => s + u.total, 0);

    console.log(`\n=== Per-user all-time spend (users: ${users.length}, with spend>0: ${spenders.length}) ===`);
    console.log(`Total:   $${totalUserSpend.toFixed(2)}`);
    console.log(`Average: $${(totalUserSpend / spenders.length).toFixed(4)}`);
    const top = spenders[0];
    console.log(`Max:     $${top.total.toFixed(4)}  (tier=${top.tier})`);

    // Max user-day proxy: max single month broken down
    console.log(`\nTop 5 spenders (all-time, months breakdown):`);
    for (const u of spenders.slice(0, 5)) {
        const mo = Object.entries(u.months).sort().map(([p, v]) => `${p}:$${v.toFixed(2)}`).join('  ');
        console.log(`  $${u.total.toFixed(2)}  tier=${u.tier}  ${mo}`);
    }

    // Per-user-per-month distribution (closer to "per active user cost")
    const monthVals = spenders.flatMap(u => Object.values(u.months)).filter(v => v > 0).sort((a, b) => a - b);
    const mpct = (p: number) => monthVals[Math.min(monthVals.length - 1, Math.floor(p * monthVals.length))];
    const mAvg = monthVals.reduce((a, b) => a + b, 0) / monthVals.length;
    console.log(`\n=== Per user-month (${monthVals.length} active user-months) ===`);
    console.log(`Average: $${mAvg.toFixed(4)}   Median: $${mpct(0.5).toFixed(4)}   Max: $${monthVals[monthVals.length - 1].toFixed(4)}`);
}

main().catch(console.error);
