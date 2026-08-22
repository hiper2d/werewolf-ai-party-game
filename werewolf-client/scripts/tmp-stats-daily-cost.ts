import { db } from "../firebase/server";

/**
 * Daily production spend over the last N days (UTC).
 *  - LLM cost: requestStats (one doc per AI request, exact timestamp, 180d TTL)
 *  - Image cost: games.totalImagesCost, bucketed by game createdAt (no per-image timestamp)
 * Usage: npx tsx --env-file=.env scripts/tmp-stats-daily-cost.ts [days=7]
 */
async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const days = Number(process.argv[2] || 7);
    const now = Date.now();
    const sinceMs = now - days * 86400000;
    const toMs = (v: any) => (v && typeof v.toMillis === 'function') ? v.toMillis() : Number(v);
    const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

    const buckets: Record<string, { llm: number; img: number; reqs: number; games: number; users: Set<string>; tiers: Record<string, number> }> = {};
    for (let i = 0; i < days; i++) buckets[dayKey(now - i * 86400000)] = { llm: 0, img: 0, reqs: 0, games: 0, users: new Set(), tiers: {} };

    // ---- LLM requests ----
    const rs = await db.collection('requestStats').where('createdAt', '>=', new Date(sinceMs)).get();
    for (const d of rs.docs) {
        const r = d.data() as any;
        const k = dayKey(toMs(r.createdAt));
        if (!buckets[k]) continue;
        buckets[k].llm += Number(r.costUSD || 0);
        buckets[k].reqs++;
        if (r.userId) buckets[k].users.add(r.userId);
        const t = r.tier || '?';
        buckets[k].tiers[t] = (buckets[k].tiers[t] || 0) + 1;
    }

    // ---- Image costs, by game creation day ----
    const gs = await db.collection('games').orderBy('createdAt', 'desc').limit(1000).get();
    for (const d of gs.docs) {
        const g = d.data() as any;
        const ms = toMs(g.createdAt);
        if (!ms || ms < sinceMs) continue;
        const k = dayKey(ms);
        if (!buckets[k]) continue;
        buckets[k].img += Number(g.totalImagesCost || 0);
        buckets[k].games++;
    }

    const keys = Object.keys(buckets).sort();
    let tl = 0, ti = 0, tr = 0, tg = 0;
    console.log(`\n=== Werewolf prod spend, last ${days} days (UTC) ===`);
    console.log(`requestStats docs in window: ${rs.size}`);
    console.log(`\nday             LLM      images       total   reqs  games  users  tiers`);
    for (const k of keys) {
        const b = buckets[k];
        const tot = b.llm + b.img;
        tl += b.llm; ti += b.img; tr += b.reqs; tg += b.games;
        const tiers = Object.entries(b.tiers).map(([t, n]) => `${t}:${n}`).join(' ');
        console.log(`${k}  $${b.llm.toFixed(4).padStart(8)}  $${b.img.toFixed(4).padStart(8)}  $${tot.toFixed(4).padStart(8)}  ${String(b.reqs).padStart(5)}  ${String(b.games).padStart(5)}  ${String(b.users.size).padStart(5)}  ${tiers}`);
    }
    const total = tl + ti;
    console.log(`\nTotal ${days}d:  LLM $${tl.toFixed(4)}  + images $${ti.toFixed(4)}  = $${total.toFixed(4)}   (${tr} requests, ${tg} games)`);
    console.log(`AVERAGE PER DAY: $${(total / days).toFixed(4)}`);
    const full = days - 1;
    const todayKey = dayKey(now);
    const exclToday = total - (buckets[todayKey].llm + buckets[todayKey].img);
    console.log(`Average per day excluding today (partial): $${(exclToday / full).toFixed(4)}`);
}

main().catch(console.error);
