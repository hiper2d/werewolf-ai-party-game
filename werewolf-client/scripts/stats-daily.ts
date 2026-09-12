import { db } from "../firebase/server";

/**
 * Daily production stats, one row per UTC day for the last N days:
 *   - requestStats cost split by `kind` (bot/gm/preview/image/tts/stt) and by `apiKeyName`,
 *     request count, distinct active users, rows by tier
 *   - new users (users.created_at) and new games (games.createdAt) that day
 *   - for TODAY only: users.dailySpend summary (spenders, total, median, top 5, cap hits)
 *     and a free-tier reconciliation of requestStats against the per-user daily ledger
 *
 * Usage: npx tsx --env-file=.env scripts/stats-daily.ts [--days 7]
 *
 * Replaces the ad-hoc tmp-stats-daily-cost.ts. Since 2026-09-11 every AI spend (game turns,
 * previews, images, voice) writes one requestStats row inside the billing transaction, so
 * Σ costUSD here is the whole provider bill, not just game LLM turns as it used to be.
 */

const DAY_MS = 86_400_000;
const KINDS = ['bot', 'gm', 'preview', 'image', 'tts', 'stt'];

const daysArgIdx = process.argv.indexOf('--days');
const DAYS = daysArgIdx > -1 ? parseInt(process.argv[daysArgIdx + 1], 10) || 7 : 7;

const toMs = (v: any) => (v && typeof v.toMillis === 'function') ? v.toMillis() : Number(v);
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const usd = (n: number) => `$${n.toFixed(3)}`;
const mask = (email: string) => email.replace(/^(.{1,3}).*?(@.*)$/, '$1…$2');
const add = (m: Record<string, number>, k: string, n: number) => { m[k] = (m[k] || 0) + n; };
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Print rows as a column-aligned table; first column left-aligned, the rest right-aligned. */
function printTable(rows: string[][]) {
    const widths = rows[0].map((_, c) => Math.max(...rows.map(r => r[c].length)));
    for (const r of rows) {
        console.log(r.map((cell, c) => c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c])).join('  '));
    }
}

type DayStat = {
    reqs: number; users: Set<string>; tiers: Record<string, number>;
    byKind: Record<string, number>; byKey: Record<string, number>; newUsers: number; newGames: number;
};
const newDay = (): DayStat => ({ reqs: 0, users: new Set(), tiers: {}, byKind: {}, byKey: {}, newUsers: 0, newGames: 0 });

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const now = Date.now();
    const today = dayKey(now);
    const sinceMs = Math.floor(now / DAY_MS) * DAY_MS - (DAYS - 1) * DAY_MS;   // UTC midnight, N-1 days back
    const days: Record<string, DayStat> = {};
    for (let i = 0; i < DAYS; i++) days[dayKey(sinceMs + i * DAY_MS)] = newDay();

    // ---- requestStats: one row per AI call ----
    const rs = await db.collection('requestStats').where('createdAt', '>=', new Date(sinceMs)).get();
    let freeToday = 0, freeTodayNoUser = 0;
    const freeUsersToday = new Set<string>();
    for (const doc of rs.docs) {
        const r = doc.data() as any;
        const key = dayKey(toMs(r.createdAt));
        const d = days[key];
        if (!d) continue;
        const cost = Number(r.costUSD) || 0;
        d.reqs++;
        if (r.userId) d.users.add(r.userId);
        add(d.tiers, r.tier || '?', 1);
        add(d.byKind, r.kind || r.actor || '?', cost);   // rows before 2026-09-11 carry only `actor`
        add(d.byKey, r.apiKeyName || '?', cost);
        if (key === today && r.tier === 'free') {
            freeToday += cost;
            if (r.userId) freeUsersToday.add(r.userId); else freeTodayNoUser += cost;
        }
    }

    // ---- new users (created_at is a Firestore Timestamp) ----
    const us = await db.collection('users').where('created_at', '>=', new Date(sinceMs)).get();
    for (const doc of us.docs) { const d = days[dayKey(toMs(doc.data().created_at))]; if (d) d.newUsers++; }

    // ---- new games (createdAt may be epoch ms or Timestamp, so filter client-side) ----
    const gs = await db.collection('games').orderBy('createdAt', 'desc').limit(1000).get();
    for (const doc of gs.docs) {
        const ms = toMs(doc.data().createdAt);
        const d = days[dayKey(ms)]; if (ms >= sinceMs && d) d.newGames++;
    }

    // ---- today's per-user daily ledger ----
    const ds = await db.collection('users').where('dailySpend.period', '==', today).get();
    const spenders: { email: string; usd: number }[] = [];
    let ledgerFree = 0, ledgerFreeUsers = 0, hitUsers = 0, hits = 0;
    for (const doc of ds.docs) {
        const s = doc.data().dailySpend || {};
        const total = Number(s.totalUSD) || 0;
        if (total > 0) spenders.push({ email: doc.id, usd: total });
        const free = Number(s.buckets?.free) || 0;
        if (free > 0) { ledgerFree += free; ledgerFreeUsers++; }
        const h = Number(s.limitHits) || 0;
        if (h > 0) { hitUsers++; hits += h; }
    }

    // ---- output ----
    const keys = Object.keys(days).sort();
    console.log(`\n=== Werewolf prod stats, last ${DAYS} days (UTC) — ${rs.size} requestStats rows ===\n`);

    console.log('Cost by kind');
    printTable([
        ['day', 'reqs', 'users', 'free/paid', ...KINDS, 'other', 'total', 'new users', 'new games'],
        ...keys.map(k => {
            const d = days[k];
            const other = sum(d.byKind) - KINDS.reduce((a, kind) => a + (d.byKind[kind] || 0), 0);
            return [
                k, String(d.reqs), String(d.users.size), `${d.tiers.free || 0}/${d.tiers.paid || 0}`,
                ...KINDS.map(kind => usd(d.byKind[kind] || 0)), usd(other), usd(sum(d.byKind)),
                String(d.newUsers), String(d.newGames),
            ];
        }),
    ]);

    const keyTotals: Record<string, number> = {};
    for (const k of keys) for (const [name, cost] of Object.entries(days[k].byKey)) add(keyTotals, name, cost);
    const keyNames = Object.keys(keyTotals).sort((a, b) => keyTotals[b] - keyTotals[a]);
    console.log('\nCost by API key');
    printTable([
        ['day', ...keyNames.map(n => n.replace(/_API_KEY$/, '')), 'total'],
        ...keys.map(k => [k, ...keyNames.map(n => usd(days[k].byKey[n] || 0)), usd(sum(days[k].byKey))]),
        ['all', ...keyNames.map(n => usd(keyTotals[n])), usd(sum(keyTotals))],
    ]);

    console.log(`\nToday ${today} (UTC) from users.dailySpend`);
    spenders.sort((a, b) => b.usd - a.usd);
    const totalSpend = spenders.reduce((a, s) => a + s.usd, 0);
    console.log(`  users with spend: ${spenders.length}   total: ${usd(totalSpend)}   median: ${usd(median(spenders.map(s => s.usd)))}`);
    console.log(`  cap hits: ${hitUsers} user(s), ${hits} refusal(s)`);
    for (const s of spenders.slice(0, 5)) console.log(`  ${usd(s.usd).padStart(9)}  ${mask(s.email)}`);

    // Reconciliation, free tier only. Both sides are the same money: recordSpend writes the
    // requestStats row and the user's dailySpend bucket in one transaction. Paid rows are
    // excluded because dailySpend.buckets.paid records the CHARGE (cost + 15% markup) while
    // requestStats.costUSD is the RAW provider cost, so those two differ by design. Free-tier
    // rows without a userId charge nobody, so they can only ever show up on the left side.
    const activeFree = Math.max(1, ledgerFreeUsers, freeUsersToday.size);
    const gap = freeToday - ledgerFree;
    const verdict = Math.abs(gap) <= 0.01 * activeFree ? 'OK' : 'BROKEN';
    console.log(`\nFree-tier reconciliation (today): ${verdict}  requestStats ${usd(freeToday)} vs dailySpend.buckets.free ${usd(ledgerFree)}`
        + `  (gap ${usd(gap)}, tolerance ${usd(0.01 * activeFree)} for ${activeFree} user(s)`
        + (freeTodayNoUser > 0 ? `, ${usd(freeTodayNoUser)} of requestStats carried no userId` : '') + ')');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
