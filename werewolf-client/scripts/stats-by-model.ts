import { db } from "../firebase/server";

/**
 * Cost + token breakdown BY MODEL across all stored games (~last 30 days, games TTL-expire).
 * Attributes each bot's tokenUsage to its aiType, plus the Game Master's usage to the GM model.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/stats-by-model.ts            # all models
 *   npx tsx --env-file=.env scripts/stats-by-model.ts fugu       # only models matching a substring, + per-game detail
 */
type Agg = { cost: number; input: number; output: number; calls: number; games: Set<string> };

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const filter = (process.argv[2] || '').toLowerCase();

    const snap = await db.collection('games').get();
    const byModel = new Map<string, Agg>();
    const get = (m: string) => {
        if (!byModel.has(m)) byModel.set(m, { cost: 0, input: 0, output: 0, calls: 0, games: new Set() });
        return byModel.get(m)!;
    };

    type Row = { id: string; created: number; owner: string; tier: string; state: string; total: number; matched: number; bots: string[] };
    const rows: Row[] = [];

    for (const doc of snap.docs) {
        const g = doc.data() as any;
        let matched = 0;
        const matchedBots: string[] = [];

        for (const bot of (g.bots || [])) {
            const model = bot.aiType || 'unknown';
            const u = bot.tokenUsage;
            if (!u) continue;
            const a = get(model);
            a.cost += Number(u.costUSD || 0);
            a.input += Number(u.inputTokens || 0);
            a.output += Number(u.outputTokens || 0);
            a.calls += 1;
            a.games.add(doc.id);
            if (filter && model.toLowerCase().includes(filter)) {
                matched += Number(u.costUSD || 0);
                matchedBots.push(`${bot.name}[${model}] $${Number(u.costUSD || 0).toFixed(4)}`);
            }
        }

        const gmModel = g.gameMasterAiType || g.gameMasterModel || 'gm-unknown';
        const gmu = g.gameMasterTokenUsage;
        if (gmu) {
            const a = get(`GM:${gmModel}`);
            a.cost += Number(gmu.costUSD || 0);
            a.input += Number(gmu.inputTokens || 0);
            a.output += Number(gmu.outputTokens || 0);
            a.calls += 1;
            a.games.add(doc.id);
            if (filter && String(gmModel).toLowerCase().includes(filter)) {
                matched += Number(gmu.costUSD || 0);
                matchedBots.push(`GM[${gmModel}] $${Number(gmu.costUSD || 0).toFixed(4)}`);
            }
        }

        if (filter && matched > 0) {
            rows.push({
                id: doc.id,
                created: Number(g.createdAt || 0),
                owner: g.ownerEmail || '?',
                tier: g.createdWithTier || '?',
                state: g.gameState || '?',
                total: Number(g.totalGameCost || 0),
                matched,
                bots: matchedBots,
            });
        }
    }

    const all = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
    const grand = all.reduce((s, [, a]) => s + a.cost, 0);

    console.log(`\n=== Cost by model (stored games: ${snap.size}, grand total: $${grand.toFixed(2)}) ===`);
    console.log('cost'.padStart(10), 'share'.padStart(7), 'games'.padStart(6), 'calls'.padStart(6), 'in'.padStart(11), 'out'.padStart(10), ' $/game', ' model');
    for (const [m, a] of all) {
        if (a.cost <= 0) continue;
        console.log(
            `$${a.cost.toFixed(4)}`.padStart(10),
            `${(100 * a.cost / grand).toFixed(1)}%`.padStart(7),
            String(a.games.size).padStart(6),
            String(a.calls).padStart(6),
            a.input.toLocaleString().padStart(11),
            a.output.toLocaleString().padStart(10),
            `$${(a.cost / a.games.size).toFixed(4)}`.padStart(8),
            ` ${m}`
        );
    }

    if (filter) {
        rows.sort((a, b) => b.created - a.created);
        console.log(`\n=== Games containing "${filter}" (${rows.length}) ===`);
        for (const r of rows) {
            const when = r.created ? new Date(r.created).toISOString().replace('T', ' ').slice(0, 16) : '?';
            console.log(`\n${when}  tier=${r.tier}  state=${r.state}  game=$${r.total.toFixed(4)}  ${filter}=$${r.matched.toFixed(4)}  ${r.id}`);
            console.log(`   owner=${r.owner}`);
            for (const b of r.bots) console.log(`   - ${b}`);
        }
        const sum = rows.reduce((s, r) => s + r.matched, 0);
        const gsum = rows.reduce((s, r) => s + r.total, 0);
        console.log(`\n"${filter}" total: $${sum.toFixed(4)} across ${rows.length} games (those games cost $${gsum.toFixed(4)} in total, ${(100 * sum / gsum).toFixed(1)}% is ${filter})`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
