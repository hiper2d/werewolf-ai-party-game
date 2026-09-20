/**
 * Measures what one bot turn really costs per model and writes the result to
 * `app/ai/measured-turn-costs.json`, the table free-tier banding and the /models page read.
 *
 * Why measured and not the sticker price: the sticker output rate ($/1M) says nothing about
 * how many tokens a model emits per turn. Grok 4.6 lists $6 output and averaged 2,200 output
 * tokens a turn (94% hidden reasoning); GLM-5.3 lists $4.40 and averaged 270. Banding on the
 * sticker rate put Grok at 3 bots a game and made it the most expensive model in the app.
 *
 * Source: the `requestStats` collection (one row per AI call, written by cost-tracking.ts in
 * the billing transaction). Only game turns (`kind` bot/gm) count — previews, images and
 * voice have their own budgets. Retired model ids are skipped rather than folded into their
 * replacement, because the replacement is a different model with a different cost.
 *
 * Usage:  npx tsx --env-file=.env scripts/measure-turn-costs.ts [--days 30] [--dry-run]
 *
 * Re-run after a catalog change (new model, new reasoning pin) or when the per-turn numbers
 * look stale. Models with fewer than MIN_CALLS rows in the window keep the sticker-price
 * estimate (see estimateTurnCostUSD in app/ai/ai-models.ts) until they have been played enough.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { db } from '../firebase/server';
import {
    SupportedAiModels,
    MODEL_PRICING,
    estimateTurnCostUSD,
    bandTurnCost,
    MEASURED_TURN_COSTS_MIN_CALLS,
    type MeasuredTurnCosts,
} from '../app/ai/ai-models';

const daysArgIdx = process.argv.indexOf('--days');
const DAYS = daysArgIdx > -1 ? parseInt(process.argv[daysArgIdx + 1], 10) || 30 : 30;
const DRY_RUN = process.argv.includes('--dry-run');
const OUT_PATH = resolve(__dirname, '../app/ai/measured-turn-costs.json');

interface Agg { calls: number; usd: number; input: number; cached: number; output: number; reasoning: number }

async function main() {
    if (!db) {
        throw new Error('Firestore is not initialized (run with --env-file=.env)');
    }
    const since = new Date(Date.now() - DAYS * 86_400_000);
    const snap = await db.collection('requestStats').where('createdAt', '>=', since).get();

    const byModel: Record<string, Agg> = {};
    snap.forEach(doc => {
        const r = doc.data();
        // Rows written before `kind` existed are all game turns; newer rows say what they are.
        if (r.kind && r.kind !== 'bot' && r.kind !== 'gm') return;
        if (r.imageCount) return;
        const id = r.modelId;
        if (!id || !SupportedAiModels[id]) return;
        const a = (byModel[id] ??= { calls: 0, usd: 0, input: 0, cached: 0, output: 0, reasoning: 0 });
        a.calls++;
        a.usd += r.costUSD ?? 0;
        a.input += r.inputTokens ?? 0;
        a.cached += r.cachedInputTokens ?? 0;
        a.output += r.outputTokens ?? 0;
        a.reasoning += r.reasoningTokens ?? 0;
    });

    const result: MeasuredTurnCosts = {
        measuredAt: new Date().toISOString().slice(0, 10),
        windowDays: DAYS,
        models: {},
    };
    for (const [id, a] of Object.entries(byModel)) {
        result.models[id] = {
            usdPerTurn: round(a.usd / a.calls, 6),
            calls: a.calls,
            inputTokens: Math.round(a.input / a.calls),
            cachedInputTokens: Math.round(a.cached / a.calls),
            outputTokens: Math.round(a.output / a.calls),
            reasoningTokens: Math.round(a.reasoning / a.calls),
        };
    }

    // Report: every catalog model, measured vs estimated, and the band each would land in.
    console.log(`requestStats rows: ${snap.size} (last ${DAYS} days), game turns per model:\n`);
    console.log(
        'model'.padEnd(16), 'calls'.padStart(5), '¢/turn'.padStart(7), 'est ¢'.padStart(6),
        'in'.padStart(6), 'out'.padStart(6), 'reas'.padStart(6), 'sticker out'.padStart(12), 'band'.padStart(7), 'basis'
    );
    const rows = Object.entries(SupportedAiModels).map(([id, config]) => {
        const pricing = MODEL_PRICING[config.modelApiName];
        const m = result.models[id];
        const estimate = pricing ? estimateTurnCostUSD(pricing) : null;
        const measured = m && m.calls >= MEASURED_TURN_COSTS_MIN_CALLS ? m.usdPerTurn : null;
        const usd = measured ?? estimate;
        return { id, m, estimate, measured, usd, pricing };
    }).sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity));
    for (const { id, m, estimate, measured, usd, pricing } of rows) {
        const band = usd === null ? { maxBotsPerGame: 0, available: false } : bandTurnCost(usd);
        const bandLabel = !band.available ? 'paid' : band.maxBotsPerGame === -1 ? 'unlim' : `${band.maxBotsPerGame} bots`;
        console.log(
            id.padEnd(16),
            String(m?.calls ?? 0).padStart(5),
            (m ? cents(m.usdPerTurn) : '-').padStart(7),
            (estimate !== null ? cents(estimate) : '-').padStart(6),
            String(m?.inputTokens ?? '-').padStart(6),
            String(m?.outputTokens ?? '-').padStart(6),
            String(m?.reasoningTokens ?? '-').padStart(6),
            (pricing ? `$${pricing.outputPrice}` : '-').padStart(12),
            bandLabel.padStart(7),
            measured !== null ? 'measured' : `estimate (${m?.calls ?? 0} < ${MEASURED_TURN_COSTS_MIN_CALLS} calls)`
        );
    }

    if (DRY_RUN) {
        console.log('\n--dry-run: not writing', OUT_PATH);
        return;
    }
    writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');
    console.log(`\nWrote ${Object.keys(result.models).length} models to ${OUT_PATH}`);
}

function round(n: number, digits: number): number {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
}

function cents(usd: number): string {
    return (usd * 100).toFixed(2);
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
