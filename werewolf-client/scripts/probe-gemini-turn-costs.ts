// Probe: what does one bot turn cost on a Gemini model, per thinking level and per turn type?
// Written 2026-11-13 to compare Gemini 4 Hydrogen with the Gemini 3.8 Flash it replaced.
// Uses a real game's last day (read-only) and the production request for each turn type:
// discussion reply, vote, night action (doctor), end-of-day notes - all through the shared
// answer schema. Models are addressed by API name, so a retired model can still be probed;
// cost comes from the rates below. Every call gets a unique first line in the system prompt,
// so nothing is read from the prompt cache: the numbers are the cold (worst) case.
// Usage: npx tsx --env-file=.env scripts/probe-gemini-turn-costs.ts [--game <id>] [--bot <name>]
//        [--models gemini-4-hydrogen,gemini-3.8-flash] [--efforts low,medium,high] [--runs 3]
import { GoogleAgent, API_KEY_CONSTANTS, type AgentLoggingConfig, type AIMessage, type ReasoningEffort } from '@hiper2d/ai-agents';
import { db } from '../firebase/server';
import { askBotChoice, askBotText } from '../app/ai/bot-turn';
import { BOT_DAY_SUMMARY_PROMPT, BOT_DOCTOR_ACTION_PROMPT, BOT_VOTE_PROMPT, STRICT_TARGET_NAME_INSTRUCTION } from '../app/ai/prompts/bot-prompts';
import { GM_COMMAND_REPLY_TO_DISCUSSION } from '../app/ai/prompts/gm-commands';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, Game, GAME_MASTER, GAME_ROLES, GameMessage, MESSAGE_ROLE, MessageType, ROLE_CONFIGS } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';

// USD per 1M tokens (ai.google.dev pricing page, 2026-11-12).
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
    'gemini-4-hydrogen': { input: 1.50, cached: 0.075, output: 7.50 },
    'gemini-3.8-flash': { input: 0.75, cached: 0.075, output: 3.75 },
};
const PICKER_ID = 'gemini-flash'; // both models sit (sat) in this slot: schema-enforcing provider

const argv = process.argv.slice(2);
const arg = (flag: string) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : undefined; };
const MODELS = (arg('--models') ?? 'gemini-4-hydrogen,gemini-3.8-flash').split(',');
const EFFORTS = (arg('--efforts') ?? 'low,medium,high').split(',') as ReasoningEffort[];
const RUNS = parseInt(arg('--runs') ?? '3', 10);

const SILENT: AgentLoggingConfig = {
    enabled: false,
    logSystemPrompt: false,
    history: { enabled: false, maxCharactersPerMessage: 0 },
    logCommand: false,
    reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

type Turn = { name: string; system: string; history: AIMessage[]; choice: boolean };
type Sample = { ms: number; input: number; cached: number; output: number; thinking: number; cost: number; chars: number };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

(async () => {
    let gameId = arg('--game');
    if (!gameId) {
        const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
        gameId = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3)!.id;
    }
    const game = await getGame(gameId!) as Game;
    const day = game.currentDay || 1;
    const base = (arg('--bot') ? game.bots.find(b => b.name === arg('--bot')) : game.bots.find(b => b.isAlive)) as Bot;
    const bot = { ...base, aiType: PICKER_ID } as Bot;
    const withBot = (b: Bot, extra: Partial<Game> = {}) => ({ ...game, ...extra, bots: game.bots.map(x => x.name === b.name ? b : x) }) as Game;
    const g = withBot(bot);
    const apiKey = ((await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any)[API_KEY_CONSTANTS.GOOGLE];
    const messages = await getBotMessages(gameId!, bot.name, day);
    const alive = [...game.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name), game.humanPlayerName];
    const gm = (msg: string): GameMessage => ({ id: null, recipientName: bot.name, authorName: GAME_MASTER, msg, messageType: MessageType.GM_COMMAND, day, timestamp: Date.now() });
    const build = (b: Bot, gg: Game, command: string, kind: Parameters<typeof buildBotTurnTail>[2]): AIMessage[] =>
        [...convertToAIMessages(b.name, [...messages, gm(command)]), { role: MESSAGE_ROLE.USER, content: buildBotTurnTail(b, gg, kind) }];

    const doctor = { ...bot, role: GAME_ROLES.DOCTOR, roleKnowledge: undefined } as Bot;
    const gDoctor = withBot(doctor);
    const gSummary = withBot(bot, { gameState: 'NEW_DAY_BOT_SUMMARIES' } as any);
    const turns: Turn[] = [
        { name: 'discussion', system: buildBotSystemPrompt(bot, g), choice: false,
          history: build(bot, g, format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name, messages_used: '1', messages_total: '6', vote_progress_pct: '20%' }), 'table') },
        { name: 'vote', system: buildBotSystemPrompt(bot, g), choice: true,
          history: build(bot, g, format(BOT_VOTE_PROMPT, { bot_name: bot.name, vote_position: '1', total_voters: String(alive.length + 1), valid_targets: alive.map(n => `- ${n}`).join('\n'), werewolf_vote_note: '' }), 'vote') },
        { name: 'night action', system: buildBotSystemPrompt(doctor, gDoctor), choice: true,
          history: build(doctor, gDoctor, format(BOT_DOCTOR_ACTION_PROMPT, { bot_name: bot.name }) + ROLE_CONFIGS[GAME_ROLES.DOCTOR].oneTimeAbilities!.kill!.promptAddition
              + `\n\n**Available targets for protection or kill:** ${alive.join(', ')}`
              + `\n\n**Valid actions tonight (the \`action\` field) — pick ONE:** "protect" (the default, also when left null) or "kill" (the one-time Doctor's Mistake)` + STRICT_TARGET_NAME_INSTRUCTION, 'night') },
        { name: 'day notes', system: buildBotSystemPrompt(bot, gSummary), choice: false,
          history: build(bot, gSummary, format(BOT_DAY_SUMMARY_PROMPT, { bot_name: bot.name, day_number: day, human_player_name: game.humanPlayerName }), 'summary') },
    ];
    console.log(`game ${gameId} day ${day}, bot ${bot.name} (${bot.role}), system ${turns[0].system.length} chars, ${messages.length} day messages, ${RUNS} runs a cell (medians)\n`);

    const one = async (model: string, effort: ReasoningEffort, turn: Turn, i: number): Promise<Sample | string> => {
        const system = `Session ${model}-${effort}-${turn.name}-${i}-${Date.now()}\n\n${turn.system}`;
        const agent = new GoogleAgent(bot.name, system, model, apiKey, true, SILENT);
        agent.reasoningEffort = effort;
        const t = Date.now();
        try {
            let usage: any, chars: number;
            if (turn.choice) {
                const [a, , u] = await askBotChoice(agent, turn.history);
                usage = u; chars = (a?.comment ?? '').length;
            } else {
                const [a, , u] = await askBotText(agent, turn.history, PICKER_ID);
                usage = u; chars = (a ?? '').length;
            }
            const p = PRICES[model];
            const cached = usage?.cachedInputTokens ?? 0;
            const cost = ((usage.inputTokens - cached) * p.input + cached * p.cached + usage.outputTokens * p.output) / 1_000_000;
            return { ms: Date.now() - t, input: usage.inputTokens, cached, output: usage.outputTokens, thinking: usage.reasoningTokens ?? 0, cost, chars };
        } catch (e) {
            return `${(e as Error).name}: ${(e as Error).message.slice(0, 160)}`;
        }
    };

    for (const turn of turns) {
        for (const model of MODELS) {
            for (const effort of EFFORTS) {
                const results = await Promise.all(Array.from({ length: RUNS }, (_, i) => one(model, effort, turn, i)));
                const ok = results.filter((r): r is Sample => typeof r !== 'string');
                const errors = results.filter((r): r is string => typeof r === 'string');
                const label = `${turn.name.padEnd(13)} ${model.padEnd(18)} ${effort.padEnd(7)}`;
                if (!ok.length) { console.log(`${label} FAILED ${errors[0]}`); continue; }
                console.log(`${label} ${(median(ok.map(r => r.ms)) / 1000).toFixed(1).padStart(5)}s  in ${median(ok.map(r => r.input))} (cached ${Math.max(...ok.map(r => r.cached))})  thinking ${String(median(ok.map(r => r.thinking))).padStart(5)}  out ${String(median(ok.map(r => r.output))).padStart(5)}  answer ${String(median(ok.map(r => r.chars))).padStart(5)}ch  ${(median(ok.map(r => r.cost)) * 100).toFixed(2)}¢  [${ok.map(r => (r.cost * 100).toFixed(2)).join(' ')}]${errors.length ? `  ${errors.length} failed: ${errors[0]}` : ''}`);
            }
        }
        console.log('');
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
