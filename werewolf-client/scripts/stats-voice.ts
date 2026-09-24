/**
 * OpenAI vs Google voice (TTS/STT) cost comparison over the `requestStats` collection.
 *
 * Voice rows carry only costUSD (no character/token counts), so the report compares
 * per-call and per-game cost by provider, plus how many games picked each provider.
 *
 * Usage:  npx tsx --env-file=.env scripts/stats-voice.ts [--days 60]
 */
import { db } from '../firebase/server';

const daysArgIdx = process.argv.indexOf('--days');
const DAYS = daysArgIdx > -1 ? parseInt(process.argv[daysArgIdx + 1], 10) || 60 : 60;

interface Row { kind: string; modelApiName: string; apiKeyName: string; costUSD: number; gameId?: string; tier?: string; userId?: string; createdAt: Date; durationMs: number; }

const pct = (s: number[], p: number) => s.length ? s[Math.max(0, Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1))] : 0;
const usd = (v: number) => `$${v.toFixed(4)}`;
const provider = (r: Row) => /google|gemini/i.test(r.apiKeyName + r.modelApiName) ? 'google' : 'openai';

async function main() {
  if (!db) throw new Error('Firestore not initialized');
  const since = new Date(Date.now() - DAYS * 86400_000);
  // No composite (kind, createdAt) index: filter by date server-side and by kind locally.
  const snap = await db.collection('requestStats').where('createdAt', '>=', since).select('kind', 'modelApiName', 'apiKeyName', 'costUSD', 'gameId', 'tier', 'userId', 'createdAt', 'durationMs').get();
  const rows: Row[] = snap.docs.map(d => { const x = d.data(); return { ...x, createdAt: x.createdAt?.toDate?.() ?? new Date(x.createdAt) } as Row; }).filter(r => r.kind === 'tts' || r.kind === 'stt');
  console.log(`scanned ${snap.size} requestStats rows`);
  console.log(`\n${rows.length} voice rows since ${since.toISOString().slice(0, 10)} (${DAYS} days)\n`);

  // 1. Per kind x provider
  const groups = new Map<string, Row[]>();
  for (const r of rows) { const k = `${r.kind}|${provider(r)}|${r.modelApiName}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  console.log('kind  provider  model                              calls   total     mean      p50       p90       max       games  users');
  for (const [k, g] of [...groups.entries()].sort()) {
    const [kind, prov, model] = k.split('|');
    const costs = g.map(r => r.costUSD).sort((a, b) => a - b);
    const total = costs.reduce((a, b) => a + b, 0);
    const games = new Set(g.map(r => r.gameId).filter(Boolean)).size;
    const users = new Set(g.map(r => r.userId).filter(Boolean)).size;
    console.log(`${kind.padEnd(5)} ${prov.padEnd(9)} ${model.padEnd(34)} ${String(g.length).padStart(5)}   ${usd(total).padEnd(9)} ${usd(total / g.length).padEnd(9)} ${usd(pct(costs, 50)).padEnd(9)} ${usd(pct(costs, 90)).padEnd(9)} ${usd(costs.at(-1)!).padEnd(9)} ${String(games).padStart(5)}  ${String(users).padStart(5)}`);
  }

  // 2. Per game: voice cost per game by provider (games with any voice rows)
  const byGame = new Map<string, { prov: string; tts: number; stt: number; ttsCalls: number; sttCalls: number }>();
  for (const r of rows) {
    if (!r.gameId) continue;
    const g = byGame.get(r.gameId) ?? { prov: provider(r), tts: 0, stt: 0, ttsCalls: 0, sttCalls: 0 };
    if (r.kind === 'tts') { g.tts += r.costUSD; g.ttsCalls++; } else { g.stt += r.costUSD; g.sttCalls++; }
    byGame.set(r.gameId, g);
  }
  console.log('\nPer game (games with voice activity):');
  for (const prov of ['openai', 'google']) {
    const gs = [...byGame.values()].filter(g => g.prov === prov);
    if (!gs.length) { console.log(`  ${prov}: no games`); continue; }
    const tot = gs.map(g => g.tts + g.stt).sort((a, b) => a - b);
    const ttsCalls = gs.reduce((a, g) => a + g.ttsCalls, 0), sttCalls = gs.reduce((a, g) => a + g.sttCalls, 0);
    console.log(`  ${prov.padEnd(7)} games=${gs.length}  voice$/game mean=${usd(tot.reduce((a, b) => a + b, 0) / gs.length)} p50=${usd(pct(tot, 50))} p90=${usd(pct(tot, 90))} max=${usd(tot.at(-1)!)}  tts calls/game=${(ttsCalls / gs.length).toFixed(1)} stt calls/game=${(sttCalls / gs.length).toFixed(1)}`);
  }

  // 3. Games created in the window by voiceProvider (adoption), and their total game cost
  const gsnap = await db.collection('games').where('createdAt', '>=', since.getTime()).get();
  const adoption = new Map<string, { n: number; withVoice: number }>();
  for (const d of gsnap.docs) {
    const g = d.data();
    const p = g.voiceProvider ?? 'unset';
    const a = adoption.get(p) ?? { n: 0, withVoice: 0 };
    a.n++; if (byGame.has(d.id)) a.withVoice++;
    adoption.set(p, a);
  }
  console.log(`\nGames created in window: ${gsnap.size}`);
  for (const [p, a] of adoption) console.log(`  voiceProvider=${p.padEnd(7)} games=${a.n}  used voice=${a.withVoice}`);

  // 4. Weekly timeline
  const weeks = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const d = new Date(r.createdAt); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const wk = d.toISOString().slice(0, 10);
    const w = weeks.get(wk) ?? {}; const k = `${provider(r)}-${r.kind}`;
    w[k] = (w[k] ?? 0) + r.costUSD; w[k + '#'] = (w[k + '#'] ?? 0) + 1; weeks.set(wk, w);
  }
  console.log('\nWeekly (week starting Sunday UTC): cost (calls)');
  for (const [wk, w] of [...weeks.entries()].sort()) {
    const cell = (k: string) => `${usd(w[k] ?? 0)} (${w[k + '#'] ?? 0})`.padEnd(18);
    console.log(`  ${wk}  openai-tts ${cell('openai-tts')} openai-stt ${cell('openai-stt')} google-tts ${cell('google-tts')} google-stt ${cell('google-stt')}`);
  }

  // 5. Tier split
  const tiers = new Map<string, number>();
  for (const r of rows) { const k = `${provider(r)}/${r.tier ?? '?'}`; tiers.set(k, (tiers.get(k) ?? 0) + r.costUSD); }
  console.log('\nCost by provider/tier:'); for (const [k, v] of [...tiers.entries()].sort()) console.log(`  ${k.padEnd(16)} ${usd(v)}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
