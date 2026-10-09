/**
 * Experiment: does giving the Jev content screen the last few chat lines change its verdicts?
 *
 * For every recorded CHAT screen call in the window, asks Jev twice, live:
 *   - baseline: today's request (buildScreenRequest), to measure run-to-run noise against the record
 *   - context:  same questions, plus `recent_chat` (the last N public lines before the message)
 * and prints both decisions side by side. Production code and prompts are not touched; the
 * context wording lives here until the experiment says it is worth shipping.
 *
 * Usage (from werewolf-client/, sandbox off — tsx needs its IPC pipe):
 *   npx tsx --env-file=.env scripts/jev-screen-context-probe.ts [--days 3] [--lines 5] [--only <rowId>]
 *
 * Costs ~$0.0001 per Jev call (2 per row).
 */

import { db } from '../firebase/server';
import { listJevScreenCallsSince, StoredJevScreenCall } from '../app/api/jev-records';
import { buildScreenRequest, decideScreen, ScreenDecision } from '../app/api/jev-screen';
import { askJev, JEV_API_KEY_NAME } from '../app/ai/jev-client';
import { JEV_SCREEN_CONTEXT_CHAT } from '../app/ai/prompts/jev-screen-prompts';

const argIdx = (flag: string) => process.argv.indexOf(flag);
const argVal = (flag: string) => (argIdx(flag) > -1 ? process.argv[argIdx(flag) + 1] : undefined);
const DAYS = parseInt(argVal('--days') ?? '3', 10) || 3;
const LINES = parseInt(argVal('--lines') ?? '5', 10) || 5;
const ONLY = argVal('--only');

const CONTEXT_WITH_HISTORY =
    JEV_SCREEN_CONTEXT_CHAT +
    ' `recent_chat` holds the last lines of the conversation before this message, oldest first, as background ' +
    'only. Judge `text`, the new message, and nothing else.';

const CHAT_TYPES = new Set(['HUMAN_PLAYER_MESSAGE', 'BOT_ANSWER']);

function messageText(msg: unknown): string {
    if (typeof msg === 'string') {
        try {
            const parsed = JSON.parse(msg);
            if (parsed && typeof parsed.reply === 'string') return parsed.reply;
        } catch { /* plain text */ }
        return msg;
    }
    if (msg && typeof msg === 'object' && typeof (msg as any).reply === 'string') return (msg as any).reply;
    return JSON.stringify(msg);
}

async function recentChat(gameId: string, beforeMs: number, text: string): Promise<string[]> {
    const snapshot = await db!.collection('games').doc(gameId).collection('messages')
        .where('timestamp', '<', beforeMs + 5_000)
        .orderBy('timestamp', 'desc')
        .limit(LINES * 4 + 10)
        .get();
    const lines = snapshot.docs
        .map(doc => doc.data())
        .filter(m => CHAT_TYPES.has(m.messageType) && m.recipientName === 'ALL')
        .map(m => ({ ts: m.timestamp as number, line: `${m.authorName}: ${messageText(m.msg)}` }))
        // the window reaches 5 s past the record (clock order of record vs. save is not guaranteed);
        // drop the screened message itself
        .filter(m => !m.line.endsWith(`: ${text}`));
    return lines.slice(0, LINES).reverse().map(m => m.line);
}

const fmt = (d: ScreenDecision) => {
    const flags = Object.entries(d.flags).filter(([, v]) => v >= 0.2).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' ') || '-';
    return `${(d.verdict + (d.reason ? `(${d.reason})` : '')).padEnd(22)} score=${d.riskScore.toFixed(2)} high=${d.highRisk.toFixed(2)} ${flags}`;
};

async function probe() {
    if (!db) throw new Error('Firestore is not initialized');
    const keys = (await db.collection('config').doc('freeTierApiKeys').get()).data()?.keys ?? {};
    const apiKey = (keys[JEV_API_KEY_NAME] as string | undefined)?.trim();
    if (!apiKey) throw new Error(`${JEV_API_KEY_NAME} missing from config/freeTierApiKeys`);

    let rows: StoredJevScreenCall[] = await listJevScreenCallsSince(Date.now() - DAYS * 86_400_000);
    rows = rows.filter(r => r.source === 'chat' && r.gameId && (!ONLY || r.id === ONLY));
    console.log(`Probing ${rows.length} chat rows (last ${DAYS}d, ${LINES} context lines)\n`);

    let changed = 0;
    for (const row of rows) {
        const history = await recentChat(row.gameId!, row.createdAt, row.text);
        const base = buildScreenRequest('chat', row.text);
        const withCtx = {
            state: { context: CONTEXT_WITH_HISTORY, recent_chat: history, text: row.text },
            questions: base.questions,
        };
        const [b, c] = await Promise.all([
            askJev(apiKey, base.state, base.questions, { timeoutMs: 10_000 }),
            askJev(apiKey, withCtx.state, withCtx.questions, { timeoutMs: 10_000 }),
        ]);
        const bd = decideScreen(b.answers);
        const cd = decideScreen(c.answers);
        if (bd.verdict !== cd.verdict) changed++;

        console.log(`[${row.id}] ${row.gameId} — "${row.text.replace(/\s+/g, ' ').slice(0, 100)}"`);
        history.forEach(line => console.log(`      · ${line.replace(/\s+/g, ' ').slice(0, 140)}`));
        console.log(`  recorded  ${row.verdict}${row.reason ? `(${row.reason})` : ''} score=${(row.riskScore ?? 0).toFixed(2)} high=${(row.highRisk ?? 0).toFixed(2)}`);
        console.log(`  baseline  ${fmt(bd)}`);
        console.log(`  context   ${fmt(cd)}${bd.verdict !== cd.verdict ? '   <-- verdict changed' : ''}\n`);
    }
    console.log(`Verdict changed on ${changed} of ${rows.length} rows.`);
}

probe().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
