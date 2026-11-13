/**
 * Probe: how fast is a Gemini model on the day-2 vote fixture, per thinking level?
 *
 * Written 2026-11-12 for the `gemini-flash` repoint from Gemini 3.8 Flash to Gemini 4 Hydrogen
 * (gemini-4-hydrogen, $1.50 / $7.50 / $0.075 cached per 1M). The request is the one
 * all-models.test.ts sends (system prompt, day-2 history, vote command, turn tail), with the
 * production 60s per-call timeout. The model is addressed by its API name, so the probe works
 * before the catalog knows it; cost is computed from the rates below, not the catalog.
 *
 * Usage: NODE_USE_ENV_PROXY=1 node --env-file=.env --import tsx scripts/probe-gemini-hydrogen.ts
 *        [--models gemini-4-hydrogen,gemini-3.8-flash] [--efforts minimal,low,medium,high] [--runs 3]
 */

import { GoogleAgent, type AgentLoggingConfig, type AIMessage, type ReasoningEffort } from '@hiper2d/ai-agents';
import { GAME_MASTER, GameMessage, MessageType } from '@/app/api/game-models';
import { BotVoteZodSchema } from '@/app/ai/prompts/zod-schemas';
import { BOT_VOTE_PROMPT } from '@/app/ai/prompts/bot-prompts';
import { format } from '@/app/ai/prompts/utils';
import { convertToAIMessages } from '@/app/utils/message-utils';
import { buildBotSystemPrompt, buildBotTurnTail } from '@/app/utils/bot-utils';
import { DAY2_VOTE_GAME, DAY2_MESSAGES, TEST_BOT_NAME, VALID_VOTE_TARGETS } from '@/app/ai/test-fixtures/day2-vote-fixture';

// USD per 1M tokens (ai.google.dev pricing page, 2026-11-12).
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
    'gemini-4-hydrogen': { input: 1.50, cached: 0.075, output: 7.50 },
    'gemini-3.8-flash': { input: 0.75, cached: 0.075, output: 3.75 },
};

const argv = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i > -1 ? argv[i + 1] : undefined;
};
const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const MODELS = list(argValue('--models') ?? 'gemini-4-hydrogen,gemini-3.8-flash');
const EFFORTS = list(argValue('--efforts') ?? 'minimal,low,medium,high') as ReasoningEffort[];
const RUNS = parseInt(argValue('--runs') ?? '3', 10);

const apiKey = process.env.GOOGLE_K;
if (!apiKey) {
    console.error('GOOGLE_K is not set (run with --env-file=.env)');
    process.exit(1);
}

const SILENT: AgentLoggingConfig = {
    enabled: false,
    logSystemPrompt: false,
    history: { enabled: false, maxCharactersPerMessage: 0 },
    logCommand: false,
    reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

const kenji = DAY2_VOTE_GAME.bots.find(b => b.name === TEST_BOT_NAME)!;
const alivePlayerNames = [
    ...DAY2_VOTE_GAME.bots.filter(b => b.isAlive && b.name !== kenji.name).map(b => b.name),
    DAY2_VOTE_GAME.humanPlayerName,
];
const systemPrompt = buildBotSystemPrompt(kenji, DAY2_VOTE_GAME);
const voteCommand: GameMessage = {
    id: null,
    recipientName: kenji.name,
    authorName: GAME_MASTER,
    msg: format(BOT_VOTE_PROMPT, {
        bot_name: kenji.name,
        vote_position: '6',
        total_voters: '8',
        valid_targets: alivePlayerNames.map(n => `- ${n}`).join('\n'),
        werewolf_vote_note: '',
    }),
    messageType: MessageType.GM_COMMAND,
    day: DAY2_VOTE_GAME.currentDay,
    timestamp: Date.now(),
};
const history: AIMessage[] = convertToAIMessages(kenji.name, [...DAY2_MESSAGES, voteCommand]);
history.push({ role: 'user', content: buildBotTurnTail(kenji, DAY2_VOTE_GAME, 'table') });

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function run(model: string, effort: ReasoningEffort): Promise<string> {
    const agent = new GoogleAgent(kenji.name, systemPrompt, model, apiKey!, true, SILENT);
    agent.reasoningEffort = effort;
    const started = Date.now();
    try {
        const [vote, , usage] = await agent.askWithZodSchema(BotVoteZodSchema, history);
        const ms = Date.now() - started;
        const price = PRICES[model];
        const cached = usage?.cachedInputTokens ?? 0;
        const cost = usage && price
            ? ((usage.inputTokens - cached) * price.input + cached * price.cached + usage.outputTokens * price.output) / 1_000_000
            : NaN;
        const valid = VALID_VOTE_TARGETS.includes(vote.who) ? 'valid' : 'INVALID';
        return `${sec(ms).padStart(6)}  in ${usage?.inputTokens} (cached ${cached})  out ${usage?.outputTokens} (thinking ${usage?.reasoningTokens ?? 0})  $${cost.toFixed(4)}  → ${vote.who} [${valid}] "${vote.why.slice(0, 110)}"`;
    } catch (e) {
        const ms = Date.now() - started;
        const err = e as Error;
        return `${sec(ms).padStart(6)}  ERROR ${err.name}: ${err.message.slice(0, 220)}`;
    }
}

async function main() {
    for (const model of MODELS) {
        for (const effort of EFFORTS) {
            console.log(`\n${model} @ ${effort}`);
            for (let i = 0; i < RUNS; i++) {
                console.log('  ' + await run(model, effort));
            }
        }
    }
}

main().then(() => process.exit(0));
