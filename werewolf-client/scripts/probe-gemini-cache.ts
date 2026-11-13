// Probe: when does Gemini's implicit prompt cache hit on a bot prompt? Sends a real game's
// last-day prompt in a fixed order and prints cached tokens per call:
//   A text, A text again, A extended (text), extended with the vote schema, the same again.
// Usage: npx tsx --env-file=.env scripts/probe-gemini-cache.ts [--model gemini-flash] [--wait 0]
import { db } from '../firebase/server';
import { AgentFactory } from '../app/ai/agent-factory';
import { BOT_VOTE_PROMPT } from '../app/ai/prompts/bot-prompts';
import { BotVoteZodSchema } from '../app/ai/prompts/zod-schemas';
import { GM_COMMAND_REPLY_TO_DISCUSSION } from '../app/ai/prompts/gm-commands';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, Game, GAME_MASTER, GameMessage, MESSAGE_ROLE, MessageType } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';

const argv = process.argv.slice(2);
const arg = (flag: string) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : undefined; };
const MODEL = arg('--model') ?? 'gemini-flash';
const WAIT = parseInt(arg('--wait') ?? '0', 10);
const sleep = (s: number) => new Promise(r => setTimeout(r, s * 1000));

(async () => {
    const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
    const gameId = arg('--game') ?? snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3)!.id;
    const game = await getGame(gameId) as Game;
    const bot = game.bots.find(b => b.isAlive) as Bot;
    const day = game.currentDay || 1;
    const apiKeys = (await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any;
    const system = `Session ${Date.now()}\n\n${buildBotSystemPrompt(bot, game)}`;
    const dayMessages = await getBotMessages(gameId, bot.name, day);
    const alive = [...game.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name), game.humanPlayerName];
    const tail = { role: MESSAGE_ROLE.USER, content: buildBotTurnTail(bot, game, 'table') };
    const gm = (msg: string): GameMessage => ({ id: null, recipientName: bot.name, authorName: GAME_MASTER, msg, messageType: MessageType.GM_COMMAND, day, timestamp: Date.now() });
    const cmd1 = gm(format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name, messages_used: '1', messages_total: '6', vote_progress_pct: '20%' }));
    const cmd2 = gm(format(BOT_VOTE_PROMPT, { bot_name: bot.name, vote_position: '1', total_voters: String(alive.length + 1), valid_targets: alive.map(n => `- ${n}`).join('\n'), werewolf_vote_note: '' }));
    const saved = { id: null, recipientName: 'ALL', authorName: bot.name, msg: { reply: 'We should slow down and look at who pushed hardest yesterday.' }, messageType: MessageType.BOT_ANSWER, day, timestamp: Date.now() } as any;
    const hA = [...convertToAIMessages(bot.name, [...dayMessages, cmd1]), tail];
    const hB = [...convertToAIMessages(bot.name, [...dayMessages, cmd1, saved, cmd2]), tail];
    const agent = AgentFactory.createAgent(bot.name, system, MODEL, apiKeys, bot.enableThinking);
    console.log(`${MODEL}, game ${gameId}, system ${system.length} chars, wait ${WAIT}s between calls`);
    const steps: [string, () => Promise<any>][] = [
        ['A text', async () => (await agent.askText(hA))[2]],
        ['A text again', async () => (await agent.askText(hA))[2]],
        ['A text 3rd', async () => (await agent.askText(hA))[2]],
        ['B (A extended) text', async () => (await agent.askText(hB))[2]],
        ['B text again', async () => (await agent.askText(hB))[2]],
        ['B vote schema', async () => (await agent.askWithZodSchema(BotVoteZodSchema, hB))[2]],
        ['B vote schema again', async () => (await agent.askWithZodSchema(BotVoteZodSchema, hB))[2]],
        ['A text after schema', async () => (await agent.askText(hA))[2]],
    ];
    if (argv.includes('--order')) {
        // What does the cache key start with? Long contents (a full earlier day), then vary one side.
        const long = await getBotMessages(gameId, bot.name, Math.max(1, day - 1));
        const hLong = [...convertToAIMessages(bot.name, [...long, cmd1]), tail];
        const hLongOtherStart = [{ role: MESSAGE_ROLE.USER, content: `Note ${Date.now()}` }, ...hLong];
        const other = AgentFactory.createAgent(bot.name, `Other ${Date.now()}\n\n${system}`, MODEL, apiKeys, bot.enableThinking);
        steps.length = 0;
        steps.push(
            ['S1 + long', async () => (await agent.askText(hLong))[2]],
            ['S1 + long again', async () => (await agent.askText(hLong))[2]],
            ['S2 + same long', async () => (await other.askText(hLong))[2]],
            ['S1 + other start', async () => (await agent.askText(hLongOtherStart as any))[2]],
            ['S1 + long + 1 turn', async () => (await agent.askText([...hLong.slice(0, -1), { role: 'assistant' as any, content: 'I will wait and watch.' }, { role: MESSAGE_ROLE.USER, content: 'Go on.' }, tail] as any))[2]],
        );
    }
    for (const [label, run] of steps) {
        const t = Date.now();
        const usage = await run();
        console.log(`${label.padEnd(22)} in=${usage?.inputTokens} cached=${usage?.cachedInputTokens ?? 0} ${((Date.now() - t) / 1000).toFixed(1)}s`);
        if (WAIT) await sleep(WAIT);
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
