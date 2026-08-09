/**
 * Per-model OUTPUT-token percentiles over `requestStats`, split by actor.
 *
 * Sizing input for the per-request `max_tokens` cap. `request-stats-report.ts`
 * prints duration percentiles; this prints output-token ones, which is what a
 * max_tokens value actually has to clear. reasoningTokens is counted INSIDE
 * outputTokens, so the outputTokens column is already the figure the cap must
 * accommodate — a cap below it truncates the answer, not just the thinking.
 *
 * Usage:  npx tsx --env-file=.env scripts/output-token-percentiles.ts [--days 30]
 */

import { db } from '../firebase/server';

const daysArgIdx = process.argv.indexOf('--days');
const DAYS = daysArgIdx > -1 ? parseInt(process.argv[daysArgIdx + 1], 10) || 30 : 30;

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

interface Bucket {
    out: number[];
    reas: number[];
}

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    const snap = await db.collection('requestStats').where('createdAt', '>=', since).get();
    console.log(`Scanned ${snap.size} requestStats docs from the last ${DAYS} days.`);

    const byModel = new Map<string, Bucket>();
    const byActor = new Map<string, Bucket>();

    for (const doc of snap.docs) {
        const d = doc.data() as any;
        const out = typeof d.outputTokens === 'number' ? d.outputTokens : 0;
        if (out <= 0) continue;
        const reas = typeof d.reasoningTokens === 'number' ? d.reasoningTokens : 0;
        const model = d.modelApiName ?? d.modelId ?? 'unknown';
        const actor = d.actor ?? 'unknown';

        let m = byModel.get(model);
        if (!m) byModel.set(model, (m = { out: [], reas: [] }));
        m.out.push(out);
        m.reas.push(reas);

        let a = byActor.get(actor);
        if (!a) byActor.set(actor, (a = { out: [], reas: [] }));
        a.out.push(out);
        a.reas.push(reas);
    }

    const pad = (s: unknown, n: number) => String(s).padEnd(n);
    const table = (title: string, map: Map<string, Bucket>) => {
        console.log(`\n=== ${title} — output tokens per request ===`);
        console.log(pad('KEY', 26) + pad('N', 8) + pad('p50', 8) + pad('p90', 8)
            + pad('p99', 8) + pad('MAX', 9) + pad('REAS p99', 10) + 'REAS MAX');
        const rows = [...map.entries()].map(([key, b]) => {
            const out = [...b.out].sort((x, y) => x - y);
            const reas = [...b.reas].sort((x, y) => x - y);
            return {
                key, n: out.length,
                p50: percentile(out, 50), p90: percentile(out, 90), p99: percentile(out, 99),
                max: out[out.length - 1],
                rp99: percentile(reas, 99), rmax: reas[reas.length - 1],
            };
        }).sort((x, y) => y.max - x.max);
        for (const r of rows) {
            console.log(pad(r.key, 26) + pad(r.n, 8) + pad(r.p50, 8) + pad(r.p90, 8)
                + pad(r.p99, 8) + pad(r.max, 9) + pad(r.rp99, 10) + r.rmax);
        }
    };

    table('BY MODEL', byModel);
    table('BY ACTOR', byActor);
}

main().catch(err => { console.error(err); process.exit(1); });
