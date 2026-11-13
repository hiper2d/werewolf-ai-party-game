// Probe: where does OpenAI's prompt cache stop when a call is extended by a turn?
// Sends a real game's day to the Responses API directly (no agent), as call A and then
// call B = A's history + an assistant reply + a new command, in three layouts of the
// unsaved turn tail: merged into the last user message (what the agent does today), as
// its own trailing user item, and absent.
// Usage: npx tsx --env-file=.env scripts/probe-openai-tail.ts [--model gpt-6-luna]
import { db } from '../firebase/server';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, Game, GAME_MASTER, GameMessage, MessageType } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';

const argv = process.argv.slice(2);
const arg = (flag: string) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : undefined; };
const MODEL = arg('--model') ?? 'gpt-6-luna';

(async () => {
    const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
    const gameId = arg('--game') ?? snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3)!.id;
    const game = await getGame(gameId) as Game;
    const bot = game.bots.find(b => b.isAlive) as Bot;
    const day = Math.max(1, (game.currentDay || 1) - 1);
    const key = ((await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any).OPENAI_API_KEY;
    const messages = await getBotMessages(gameId, bot.name, day);
    const gm = (msg: string): GameMessage => ({ id: null, recipientName: bot.name, authorName: GAME_MASTER, msg, messageType: MessageType.GM_COMMAND, day, timestamp: Date.now() });
    const cmd1 = gm(`${bot.name}, reply to the discussion in one sentence.`);
    const cmd2 = gm(`${bot.name}, say in one sentence who you would vote for.`);
    const saved = { id: null, recipientName: 'ALL', authorName: bot.name, msg: { reply: 'We should slow down and look at who pushed hardest yesterday.' }, messageType: MessageType.BOT_ANSWER, day, timestamp: Date.now() } as any;
    const tail = buildBotTurnTail({ ...bot, aiType: 'x' } as Bot, game, 'table');
    const merge = (h: any[]) => { const r: any[] = []; for (const m of h) { const p = r[r.length - 1]; if (p && p.role === 'user' && m.role === 'user') r[r.length - 1] = { ...p, content: p.content + '\n\n' + m.content }; else r.push({ role: m.role, content: String(m.content) }); } return r; };
    const hA = merge(convertToAIMessages(bot.name, [...messages, cmd1]));
    const hB = merge(convertToAIMessages(bot.name, [...messages, cmd1, saved, cmd2]));
    const withTail = (h: any[], layout: string) => layout === 'none' ? h
        : layout === 'separate' ? [...h, { role: 'user', content: tail }]
        : [...h.slice(0, -1), { ...h[h.length - 1], content: h[h.length - 1].content + '\n\n' + tail }];
    const call = async (instructions: string, input: any[], cacheKey: string) => {
        const res = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: MODEL, instructions, input, store: false, prompt_cache_key: cacheKey, reasoning: { effort: 'low' }, max_output_tokens: 2000 }),
        });
        const json: any = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
        return `in=${json.usage.input_tokens} cached=${json.usage.input_tokens_details?.cached_tokens ?? 0}`;
    };
    console.log(`${MODEL}, game ${gameId} day ${day}, ${messages.length} messages, ${hA.length} input items`);
    for (const layout of ['merged', 'separate', 'none']) {
        const nonce = `${layout}-${Date.now()}`;
        const instructions = `Session ${nonce}\n\n${buildBotSystemPrompt(bot, game)}`;
        console.log(`${layout.padEnd(9)} A:       ${await call(instructions, withTail(hA, layout), nonce)}`);
        console.log(`${layout.padEnd(9)} B (A+1): ${await call(instructions, withTail(hB, layout), nonce)}`);
        console.log(`${layout.padEnd(9)} B again: ${await call(instructions, withTail(hB, layout), nonce)}`);
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
