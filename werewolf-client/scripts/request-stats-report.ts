/**
 * Per-model report over the `requestStats` collection (one doc per AI request, written by
 * cost-tracking.ts inside the billing transaction).
 *
 * Prints, per modelApiName: request count, duration percentiles (p50/p90/max), cached-input
 * ratio, effective output multiplier (outputTokens / visible output — the measured version
 * of FREE_TIER_THINKING_COST_FACTOR), and cost per request.
 *
 * Usage:  npx tsx --env-file=.env scripts/request-stats-report.ts [--days 30]
 */

import { db } from '../firebase/server';

const daysArgIdx = process.argv.indexOf('--days');
const DAYS = daysArgIdx > -1 ? parseInt(process.argv[daysArgIdx + 1], 10) || 30 : 30;

interface Row {
    modelApiName: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    costUSD: number;
    durationMs: number;
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

const fmtMs = (ms: number) => ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 1000).toFixed(2)}s`;

async function report() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection('requestStats')
        .where('createdAt', '>=', since)
        .get();

    console.log(`requestStats: ${snapshot.size} requests in the last ${DAYS} days\n`);
    if (snapshot.empty) {
        return;
    }

    const byModel = new Map<string, Row[]>();
    for (const doc of snapshot.docs) {
        const d = doc.data() as Row;
        const rows = byModel.get(d.modelApiName) ?? [];
        rows.push(d);
        byModel.set(d.modelApiName, rows);
    }

    const header = ['Model', 'Reqs', 'p50', 'p90', 'max', 'Cached%', 'EffMult', '$/req', '$total'];
    const table: string[][] = [header];

    const sortedModels = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [model, rows] of sortedModels) {
        const durations = rows.map(r => r.durationMs || 0).filter(d => d > 0).sort((a, b) => a - b);
        const totalInput = rows.reduce((n, r) => n + (r.inputTokens || 0), 0);
        const totalCached = rows.reduce((n, r) => n + (r.cachedInputTokens || 0), 0);
        const totalOutput = rows.reduce((n, r) => n + (r.outputTokens || 0), 0);
        const totalReasoning = rows.reduce((n, r) => n + (r.reasoningTokens || 0), 0);
        const totalCost = rows.reduce((n, r) => n + (r.costUSD || 0), 0);
        const visibleOutput = totalOutput - totalReasoning;

        table.push([
            model,
            String(rows.length),
            durations.length ? fmtMs(percentile(durations, 50)) : '—',
            durations.length ? fmtMs(percentile(durations, 90)) : '—',
            durations.length ? fmtMs(durations[durations.length - 1]) : '—',
            totalInput > 0 ? `${((totalCached / totalInput) * 100).toFixed(0)}%` : '—',
            // Measured reasoning overhead: how much bigger the billed output is than the
            // visible answer. Compare against FREE_TIER_THINKING_COST_FACTOR (2.5).
            visibleOutput > 0 ? (totalOutput / visibleOutput).toFixed(2) : '—',
            `$${(totalCost / rows.length).toFixed(4)}`,
            `$${totalCost.toFixed(2)}`,
        ]);
    }

    const widths = header.map((_, col) => Math.max(...table.map(row => row[col].length)));
    for (const row of table) {
        console.log(row.map((cell, col) => cell.padEnd(widths[col] + 2)).join(''));
    }
}

report()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Report failed:', error);
        process.exit(1);
    });
