/**
 * Report over the Jev content screen records (`jevScreenCalls`, written by app/api/jev-screen.ts).
 *
 * Three parts:
 *   1. Counts per verdict and source, latency percentiles, error rate, cost — is the screen
 *      healthy and are the thresholds sitting clear of ordinary game talk?
 *   2. The grey and would-block rows with an excerpt, the score and the top flags — the rows
 *      to read by hand before flipping `jevScreenMode` to `enforce`.
 *   3. Games that hit a provider refusal in the window, joined with their screen rows — did a
 *      player message we let through precede it, or did the bots drift on their own?
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/jev-screen-report.ts [--days 7] [--all] [--replay]
 *     --all     print every row, not only grey / would-block
 *     --replay  re-run today's decideScreen / JEV_SCREEN_CONFIG on the recorded answers and
 *               show where the verdict would change (thresholds or wording were tuned)
 */

import { db } from '../firebase/server';
import { listJevScreenCallsSince, StoredJevScreenCall } from '../app/api/jev-records';
import { decideScreen, JEV_SCREEN_CONFIG } from '../app/api/jev-screen';

const argIdx = (flag: string) => process.argv.indexOf(flag);
const DAYS = argIdx('--days') > -1 ? parseInt(process.argv[argIdx('--days') + 1], 10) || 7 : 7;
const SHOW_ALL = argIdx('--all') > -1;
const REPLAY = argIdx('--replay') > -1;

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

const when = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
const excerpt = (text: string, max = 110) => {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const topFlags = (flags: Record<string, number> | null) =>
    Object.entries(flags ?? {})
        .filter(([, v]) => v >= 0.2)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v.toFixed(2)}`)
        .join(' ') || '-';

function printRow(row: StoredJevScreenCall): void {
    const where = row.source === 'chat' ? `game ${row.gameId} day ${row.day}` : 'preview';
    const verdict = `${row.verdict}${row.reason ? `(${row.reason})` : ''}${row.enforced ? ' REJECTED' : ''}`;
    console.log(`  ${when(row.createdAt)}  ${verdict.padEnd(24)} score=${(row.riskScore ?? 0).toFixed(2)} high=${(row.highRisk ?? 0).toFixed(2)}  ${topFlags(row.flags)}`);
    console.log(`      ${row.userEmail}  ${where}  [${row.id}]`);
    console.log(`      "${excerpt(row.text)}"`);
}

async function report() {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;
    const rows = await listJevScreenCallsSince(since);

    console.log(`\nJev content screen — last ${DAYS} days, ${rows.length} calls\n`);
    if (rows.length === 0) {
        return;
    }

    // 1. Health and distribution
    const byVerdict: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    let cost = 0;
    const durations: number[] = [];
    for (const row of rows) {
        byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;
        bySource[row.source] = (bySource[row.source] ?? 0) + 1;
        byMode[row.mode] = (byMode[row.mode] ?? 0) + 1;
        cost += row.costUSD ?? 0;
        if (row.durationMs) durations.push(row.durationMs);
    }
    durations.sort((a, b) => a - b);
    const pct = (n: number) => `${n} (${((100 * n) / rows.length).toFixed(1)}%)`;
    console.log('Verdicts:  ' + ['ok', 'grey', 'would_block', 'error'].map(v => `${v} ${pct(byVerdict[v] ?? 0)}`).join('   '));
    console.log('Sources:   ' + Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join('   ') + '     Modes: ' + Object.entries(byMode).map(([k, v]) => `${k} ${v}`).join('   '));
    console.log(`Latency:   p50 ${percentile(durations, 50)} ms   p90 ${percentile(durations, 90)} ms   max ${percentile(durations, 100)} ms   (timeout ${JEV_SCREEN_CONFIG.TIMEOUT_MS} ms)`);
    console.log(`Cost:      $${cost.toFixed(4)} total, $${(cost / rows.length).toFixed(6)} per call`);

    const scores = rows.map(r => r.riskScore ?? 0).sort((a, b) => a - b);
    const buckets = [0, 0.5, 1, 1.5, 2, 2.5, 3.01];
    const hist = buckets.slice(0, -1).map((lo, i) => {
        const hi = buckets[i + 1];
        const n = scores.filter(s => s >= lo && s < hi).length;
        return `${lo.toFixed(1)}–${Math.min(hi, 3).toFixed(1)}: ${n}`;
    });
    console.log(`Score histogram:  ${hist.join('   ')}   (grey ≥ ${JEV_SCREEN_CONFIG.GREY_SCORE}, block when top-two ≥ ${JEV_SCREEN_CONFIG.BLOCK_HIGH_RISK_PROBABILITY})`);

    // 2. The rows to read
    const interesting = SHOW_ALL ? rows : rows.filter(r => r.verdict === 'grey' || r.verdict === 'would_block' || r.verdict === 'error');
    console.log(`\n${SHOW_ALL ? 'All rows' : 'Grey, would-block and error rows'} (${interesting.length}):`);
    for (const row of interesting) {
        if (row.verdict === 'error') {
            console.log(`  ${when(row.createdAt)}  error                    ${row.error ?? ''}  [${row.id}]`);
            continue;
        }
        printRow(row);
    }

    // 2b. Replay against the current logic
    if (REPLAY) {
        const changed = rows
            .filter(r => r.answers)
            .map(r => ({ row: r, now: decideScreen(r.answers!) }))
            .filter(({ row, now }) => now.verdict !== row.verdict || now.reason !== row.reason);
        console.log(`\nReplay with the current thresholds: ${changed.length} of ${rows.length} verdicts would change`);
        for (const { row, now } of changed) {
            console.log(`  ${when(row.createdAt)}  ${row.verdict}${row.reason ? `(${row.reason})` : ''} → ${now.verdict}${now.reason ? `(${now.reason})` : ''}  "${excerpt(row.text, 80)}"  [${row.id}]`);
        }
    }

    // 3. Join against provider refusals
    const gamesSnap = await db.collection('games').where('createdAt', '>=', since).get();
    const refused = gamesSnap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .filter(g => g.providerBlocks && Object.keys(g.providerBlocks).length > 0);
    console.log(`\nGames created in the window with a provider refusal: ${refused.length}`);
    const byGame = new Map<string, StoredJevScreenCall[]>();
    for (const row of rows) {
        if (row.gameId) byGame.set(row.gameId, [...(byGame.get(row.gameId) ?? []), row]);
    }
    for (const game of refused) {
        const blocks = Object.values(game.providerBlocks as Record<string, any>)
            .map(b => `${b.provider} day ${b.day}${b.reason ? ` (${b.reason})` : ''}${b.botName ? ` on ${b.botName}` : ''}`)
            .join('; ');
        const screened = byGame.get(game.id) ?? [];
        const worst = screened.reduce<StoredJevScreenCall | null>((best, r) => (!best || (r.riskScore ?? 0) > (best.riskScore ?? 0) ? r : best), null);
        console.log(`\n  ${game.id}  "${excerpt(game.theme ?? '', 60)}"  refused: ${blocks}`);
        console.log(`      ${screened.length} screened messages, worst verdict: ${worst ? `${worst.verdict}${worst.reason ? `(${worst.reason})` : ''} score=${(worst.riskScore ?? 0).toFixed(2)}` : 'none'}`);
        if (screened.length === 0) {
            console.log('      → no player text was screened: the story or the bots got there on their own (or the screen was off)');
        } else if (worst && worst.verdict === 'would_block') {
            console.log(`      → the screen flagged a player message${worst.enforced ? ' and rejected it' : ' (monitor mode, let through)'}`);
        } else {
            console.log('      → every player message passed: either a threshold is too loose or the bots drifted');
        }
        for (const row of screened.filter(r => r.verdict !== 'ok')) {
            printRow(row);
        }
    }
    console.log();
}

report().catch(error => {
    console.error(error);
    process.exit(1);
});
