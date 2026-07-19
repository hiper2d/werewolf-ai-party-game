import { db } from "../firebase/server";

/**
 * Aggregate reasoning-token inflation per model across recent games.
 *
 * For every bot (and Game Master) usage record, sums outputTokens and the
 * reasoningTokens breakdown (reasoning is counted INSIDE outputTokens), then
 * reports per model: multiplier = outputTokens / (outputTokens - reasoningTokens),
 * i.e. how much the visible reply understates billed output tokens.
 *
 * Usage: npx tsx --env-file=.env scripts/reasoning-stats.ts [gamesLimit=500]
 */

interface Agg {
    usages: number;         // bot/GM records seen
    withReasoning: number;  // records that reported reasoningTokens > 0
    games: Set<string>;
    outputTokens: number;
    reasoningTokens: number;
    // Sums over ONLY the records that reported reasoning — the meaningful multiplier
    // sample, since records without the breakdown may just predate agent support.
    reasOutputTokens: number;
    reasReasoningTokens: number;
}

async function main(limit: number) {
    if (!db) throw new Error('Firestore is not initialized');

    const snap = await db.collection('games')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    const byModel = new Map<string, Agg>();
    const add = (gameId: string, model: string, usage: any) => {
        if (!model || !usage || typeof usage.outputTokens !== 'number' || usage.outputTokens <= 0) return;
        let a = byModel.get(model);
        if (!a) byModel.set(model, a = { usages: 0, withReasoning: 0, games: new Set(), outputTokens: 0, reasoningTokens: 0, reasOutputTokens: 0, reasReasoningTokens: 0 });
        const reasoning = Math.min(typeof usage.reasoningTokens === 'number' ? usage.reasoningTokens : 0, usage.outputTokens); // guard malformed rows
        a.usages++;
        a.games.add(gameId);
        a.outputTokens += usage.outputTokens;
        a.reasoningTokens += reasoning;
        if (reasoning > 0) {
            a.withReasoning++;
            a.reasOutputTokens += usage.outputTokens;
            a.reasReasoningTokens += reasoning;
        }
    };

    let scanned = 0;
    for (const doc of snap.docs) {
        const g = doc.data();
        scanned++;
        for (const bot of g.bots ?? []) add(doc.id, bot.aiType, bot.tokenUsage);
        add(doc.id, g.gameMasterAiType, g.gameMasterTokenUsage);
    }

    const rows = [...byModel.entries()].map(([model, a]) => {
        // Multiplier computed over reporting records only: how much billed output
        // exceeds the visible reply when we can actually see the breakdown.
        const visible = a.reasOutputTokens - a.reasReasoningTokens;
        return {
            model,
            usages: a.usages,
            withReasoning: a.withReasoning,
            games: a.games.size,
            outputTokens: a.outputTokens,
            reasoningTokens: a.reasoningTokens,
            reasoningShare: a.reasOutputTokens ? a.reasReasoningTokens / a.reasOutputTokens : 0,
            multiplier: a.withReasoning === 0 ? null : visible > 0 ? a.reasOutputTokens / visible : Infinity,
        };
    }).sort((x, y) => (y.multiplier ?? 0) - (x.multiplier ?? 0));

    console.log(`Scanned ${scanned} games (most recent by createdAt).\n`);
    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(pad('MODEL', 26) + pad('GAMES', 7) + pad('USAGES', 8) + pad('W/REAS', 8)
        + pad('OUT TOKENS', 13) + pad('REASONING', 13) + pad('SHARE', 8) + 'MULTIPLIER');
    for (const r of rows) {
        console.log(
            pad(r.model, 26) + pad(String(r.games), 7) + pad(String(r.usages), 8) + pad(String(r.withReasoning), 8)
            + pad(r.outputTokens.toLocaleString('en-US'), 13) + pad(r.reasoningTokens.toLocaleString('en-US'), 13)
            + pad((r.reasoningShare * 100).toFixed(1) + '%', 8)
            + (r.multiplier === null ? 'n/a' : r.multiplier === Infinity ? 'inf' : r.multiplier.toFixed(2) + 'x')
        );
    }
}

const limit = parseInt(process.argv[2] ?? '500', 10);
main(limit).catch(err => { console.error(err); process.exit(1); });
