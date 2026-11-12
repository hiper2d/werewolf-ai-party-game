// Replay ONE bot's end-of-day summaries on a real game, day by day, on the current prompt
// layout (static system prompt → append-only day entries → the day's messages → turn tail),
// with real model calls. Read-only on Firestore: nothing is written back to the game.
// Checks that each day's system prompt is a prefix of the next day's, prints sizes, token
// usage and the notes the bot wrote, then asks for one discussion reply on the last day.
// Usage: npx tsx --env-file=.env scripts/replay-day-entries.ts [gameId] [botName] [--model <id>]
// Output: logs/replay-<bot>-<gameId>.txt with the final system prompt and every answer.
import { db } from '../firebase/server';
import { AgentFactory } from '../app/ai/agent-factory';
import { BOT_DAY_SUMMARY_PROMPT } from '../app/ai/prompts/bot-prompts';
import { GM_COMMAND_REPLY_TO_DISCUSSION } from '../app/ai/prompts/gm-commands';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, BotDaySummary, Game, GAME_MASTER, GameMessage, MESSAGE_ROLE, MessageType } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';
import * as fs from 'fs';

const argv = process.argv.slice(2);
const modelFlag = argv.indexOf('--model');
const modelOverride = modelFlag > -1 ? argv[modelFlag + 1] : undefined;
const positional = argv.filter((a, i) => !a.startsWith('--') && (modelFlag === -1 || i !== modelFlag + 1));

(async () => {
    let [gameId, botName] = positional;
    if (!gameId) {
        const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
        const pick = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3);
        if (!pick) { console.error('no recent game with 3+ days'); process.exit(1); }
        gameId = pick.id;
    }
    const game = await getGame(gameId) as Game;
    const lastDay = game.currentDay || 1;
    const real = (botName ? game.bots.find(b => b.name === botName)
        : game.bots.find(b => b.isAlive && b.roleKnowledge && Object.values(b.roleKnowledge).some(v => Array.isArray(v) && v.length > 0))
            ?? game.bots.find(b => b.isAlive)) as Bot;
    if (!real) { console.error('bot not found'); process.exit(1); }
    const model = modelOverride ?? real.aiType;
    const apiKeys = (await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any;
    console.log(`game ${gameId} (day ${lastDay}, ${game.gameState})  bot ${real.name} (${real.role})  model ${model}`);

    let out = '';
    const notes: BotDaySummary[] = [];
    let previousPrompt = '';
    const view = (day: number): { g: Game; bot: Bot } => {
        const bot = { ...real, summary: undefined, daySummaries: undefined, personalSummaries: [...notes] } as Bot;
        const g = { ...game, currentDay: day, bots: game.bots.map(b => b.name === bot.name ? bot : b) } as Game;
        return { g, bot };
    };
    const usageLine = (u: any) => u ? `in=${u.inputTokens} cached=${u.cachedInputTokens ?? 0} out=${u.outputTokens}` : 'no usage';

    for (let day = 1; day < lastDay; day++) {
        const { g, bot } = view(day);
        (g as any).gameState = 'NEW_DAY_BOT_SUMMARIES';
        const system = buildBotSystemPrompt(bot, g);
        const prefixOk = system.startsWith(previousPrompt);
        previousPrompt = system;
        const messages = await getBotMessages(gameId, bot.name, day);
        const command: GameMessage = {
            id: null, recipientName: bot.name, authorName: GAME_MASTER,
            msg: format(BOT_DAY_SUMMARY_PROMPT, { bot_name: bot.name, day_number: day, human_player_name: g.humanPlayerName }),
            messageType: MessageType.GM_COMMAND, day, timestamp: Date.now(),
        };
        const history = convertToAIMessages(bot.name, [...messages, command]);
        const tail = buildBotTurnTail(bot, g, 'summary');
        history.push({ role: MESSAGE_ROLE.USER, content: tail });
        const agent = AgentFactory.createAgent(bot.name, system, model, apiKeys, real.enableThinking);
        const t0 = Date.now();
        const [answer, , usage] = await agent.askText(history);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`day ${day} summary: system=${system.length} chars (prefix of previous: ${prefixOk})  messages=${messages.length}  ${usageLine(usage)}  ${secs}s  notes=${(answer || '').length} chars`);
        out += `\n==================== DAY ${day} SUMMARY ====================\n--- turn tail ---\n${tail}\n--- notes written ---\n${answer}\n`;
        if (answer) notes.push({ day, summary: answer });
    }

    const { g, bot } = view(lastDay);
    const system = buildBotSystemPrompt(bot, g);
    console.log(`day ${lastDay} system prompt: ${system.length} chars (prefix of previous: ${system.startsWith(previousPrompt)})`);
    const messages = await getBotMessages(gameId, bot.name, lastDay);
    const command: GameMessage = {
        id: null, recipientName: bot.name, authorName: GAME_MASTER,
        msg: format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name, messages_used: '1', messages_total: '6', vote_progress_pct: '20%' }),
        messageType: MessageType.GM_COMMAND, day: lastDay, timestamp: Date.now(),
    };
    const history = convertToAIMessages(bot.name, [...messages, command]);
    history.push({ role: MESSAGE_ROLE.USER, content: buildBotTurnTail(bot, g, 'table') });
    const agent = AgentFactory.createAgent(bot.name, system, model, apiKeys, real.enableThinking);
    const ask = async (label: string) => {
        const t0 = Date.now();
        const [answer, , usage] = await agent.askText(history);
        console.log(`day ${lastDay} discussion reply ${label}: ${usageLine(usage)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        return answer;
    };
    const reply = await ask('#1');
    await ask('#2 (same prompt, cache check)');
    out = `# ${bot.name} (${bot.role}) in ${gameId}, model ${model}, replayed ${new Date().toISOString()}\n\n==================== DAY ${lastDay} SYSTEM PROMPT (${system.length} chars) ====================\n${system}\n${out}\n==================== DAY ${lastDay} DISCUSSION REPLY ====================\n${reply}\n`;
    fs.mkdirSync('logs', { recursive: true });
    const path = `logs/replay-${bot.name.toLowerCase()}-${gameId}.txt`;
    fs.writeFileSync(path, out);
    console.log(`WROTE ${path}`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
