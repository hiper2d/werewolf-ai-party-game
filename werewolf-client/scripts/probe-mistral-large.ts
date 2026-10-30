/**
 * Probe: how fast is Mistral Large 4 on real game requests, per reasoning level?
 *
 * Large 4 was added in lib 0.19.0 and pulled in 0.19.1 (2026-10-07) because at `high` — the
 * only level it took then — a day-2 vote ran 25-154s and the story batches were served one at
 * a time. Mistral's reasoning docs now list `low`, `medium` and `high` for Large 4 (and no
 * `none`), so this script times each level on:
 *   1. the day-2 vote fixture (the same request all-models.test.ts sends), N runs per level,
 *      with the production 60s per-call timeout;
 *   2. the real story pipeline (generateGamePreview, 15 bots, casting + 4 parallel sheet
 *      batches) at one chosen level;
 *   3. a tiny ask with `none` and with the field omitted, to confirm what the API accepts
 *      and whether an omitted field still reasons.
 *
 * The library clamps every Mistral effort to `high` (MISTRAL_REASONING_EFFORTS), so the level
 * is rewritten on the wire here by wrapping global fetch — the agent code is otherwise the
 * one production runs. Cost is computed from the docs rates (mistral-large-4-0 page,
 * 2026-10-30: $0.70 in, $0.07 cached, $2.10 out per 1M) so the probe also works while the
 * model is out of the catalog, as it was between lib 0.19.1 and 0.31.0.
 *
 * Result 2026-10-30 (the re-add): 19 votes in 6-25s, no timeouts, story 114-118s — see the
 * catalog note in the library. Re-run this before changing its tags or effort pin.
 *
 * Usage: NODE_USE_ENV_PROXY=1 node --env-file=.env --import tsx scripts/probe-mistral-large.ts
 *        [--efforts high,medium,low] [--runs 3] [--story medium] [--no-levels] [--no-vote]
 *        (`npx tsx` works outside the Claude Code sandbox; inside it the tsx CLI cannot open
 *        its IPC pipe and Node's fetch needs the proxy switch to resolve api.mistral.ai.)
 */

import { MistralAgent, type AgentLoggingConfig, type AIMessage } from '@hiper2d/ai-agents';
import { STORY_MAX_OUTPUT_TOKENS, STORY_REQUEST_TIMEOUT_MS, configureStoryAgent } from '@/app/ai/ai-models';
import { GAME_MASTER, GAME_ROLES, GameMessage, MessageType, PLAY_STYLE_CONFIGS, ROLE_CONFIGS } from '@/app/api/game-models';
import { BotVoteZodSchema } from '@/app/ai/prompts/zod-schemas';
import { generateGamePreview } from '@/app/ai/preview-generation';
import { getDefaultVoiceProvider, getVoiceConfig } from '@/app/ai/voice-config';
import { botSystemPrompt, BOT_VOTE_PROMPT, botReminderPostfix, replyLengthInstruction } from '@/app/ai/prompts/bot-prompts';
import { format } from '@/app/ai/prompts/utils';
import { convertToAIMessages } from '@/app/utils/message-utils';
import { generateBotContextSection, generateWerewolfTeammatesSection, generatePlayStyleDescription } from '@/app/utils/bot-utils';
import { DAY2_VOTE_GAME, DAY2_MESSAGES, TEST_BOT_NAME, VALID_VOTE_TARGETS } from '@/app/ai/test-fixtures/day2-vote-fixture';
import { z } from 'zod';

const MODEL = 'mistral-large-4';
const PRICE = { input: 0.70, cached: 0.07, output: 2.10 }; // USD per 1M tokens

const argv = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i > -1 ? argv[i + 1] : undefined;
};
const EFFORTS = (argValue('--efforts') ?? 'high,medium,low').split(',').map(s => s.trim()).filter(Boolean);
const RUNS = parseInt(argValue('--runs') ?? '3', 10);
const STORY_EFFORT = argValue('--story');
const PROBE_LEVELS = !argv.includes('--no-levels');
const RUN_VOTE = !argv.includes('--no-vote');

const apiKey = process.env.MISTRAL_K;
if (!apiKey) {
    console.error('MISTRAL_K is not set (run with --env-file=.env)');
    process.exit(1);
}

const SILENT: AgentLoggingConfig = {
    enabled: false,
    logSystemPrompt: false,
    history: { enabled: false, maxCharactersPerMessage: 0 },
    logCommand: false,
    reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

// --- wire-level reasoning_effort override -------------------------------------------------
// null = leave what the agent sent ('high'); 'omit' = strip the field; otherwise the level.
let wireEffort: string | null = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (wireEffort !== null && url.endsWith('/chat/completions')) {
        const req = input instanceof Request ? input : new Request(input, init);
        const json = JSON.parse(await req.clone().text());
        if (wireEffort === 'omit') delete json.reasoning_effort;
        else json.reasoning_effort = wireEffort;
        return realFetch(new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(json) }));
    }
    return realFetch(input as RequestInfo, init);
}) as typeof fetch;

function makeAgent(name: string, instruction: string): MistralAgent {
    const agent = new MistralAgent(name, instruction, MODEL, apiKey!, true, SILENT);
    agent.reasoningEffort = 'high'; // makes the agent's hook emit the field; the wire override sets the level
    return agent;
}

function costUSD(u: { inputTokens: number; outputTokens: number; cachedInputTokens?: number } | undefined): number {
    if (!u) return 0;
    const cached = u.cachedInputTokens ?? 0;
    return ((u.inputTokens - cached) * PRICE.input + cached * PRICE.cached + u.outputTokens * PRICE.output) / 1_000_000;
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// --- 1. day-2 vote, exactly as all-models.test.ts builds it ------------------------------
const kenji = DAY2_VOTE_GAME.bots.find(b => b.name === TEST_BOT_NAME)!;
const alivePlayerNames = [
    ...DAY2_VOTE_GAME.bots.filter(b => b.isAlive && b.name !== kenji.name).map(b => b.name),
    DAY2_VOTE_GAME.humanPlayerName,
];
const voteSystemPrompt = format(botSystemPrompt(DAY2_VOTE_GAME.gameMode), {
    name: kenji.name,
    personal_story: kenji.story,
    play_style: '',
    role: kenji.role,
    human_player_name: DAY2_VOTE_GAME.humanPlayerName,
    werewolf_teammates_section: generateWerewolfTeammatesSection(kenji, DAY2_VOTE_GAME),
    players_names: alivePlayerNames.join(', '),
    dead_players_names_with_roles: DAY2_VOTE_GAME.bots.filter(b => !b.isAlive).map(b => `${b.name} (${b.role})`).join(', '),
    bot_context: generateBotContextSection(kenji, DAY2_VOTE_GAME),
});
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
    }) + format(botReminderPostfix(DAY2_VOTE_GAME.gameMode), {
        play_style: generatePlayStyleDescription(kenji),
        human_player_name: DAY2_VOTE_GAME.humanPlayerName,
        reply_length_instruction: replyLengthInstruction(DAY2_VOTE_GAME.longReplies),
    }),
    messageType: MessageType.GM_COMMAND,
    day: DAY2_VOTE_GAME.currentDay,
    timestamp: Date.now(),
};
const voteHistory: AIMessage[] = convertToAIMessages(kenji.name, [...DAY2_MESSAGES, voteCommand]);

async function voteRun(effort: string): Promise<string> {
    wireEffort = effort;
    const agent = makeAgent(kenji.name, voteSystemPrompt);
    const start = Date.now();
    try {
        const [vote, thinking, usage] = await agent.askWithZodSchema(BotVoteZodSchema, voteHistory);
        const ms = Date.now() - start;
        const valid = VALID_VOTE_TARGETS.includes(vote.who) ? 'valid' : `INVALID (${vote.who})`;
        return `${sec(ms).padStart(7)}  out=${String(usage?.outputTokens ?? '?').padStart(5)}  cached=${usage?.cachedInputTokens ?? 0}/${usage?.inputTokens ?? '?'}  think=${thinking.length} chars  $${costUSD(usage).toFixed(4)}  vote=${vote.who} ${valid}`;
    } catch (e) {
        return `${sec(Date.now() - start).padStart(7)}  FAILED: ${(e as Error).message.slice(0, 160)}`;
    }
}

// --- 3. level acceptance ------------------------------------------------------------------
const PingSchema = z.object({ answer: z.string() });
async function levelProbe(level: string): Promise<string> {
    wireEffort = level;
    const agent = makeAgent('Probe', 'You answer in one short sentence.');
    const start = Date.now();
    try {
        const [, thinking, usage] = await agent.askWithZodSchema(PingSchema, [{ role: 'user', content: 'Name one werewolf-game role.' }]);
        return `accepted in ${sec(Date.now() - start)}, thinking=${thinking.length} chars, out=${usage?.outputTokens}`;
    } catch (e) {
        return `REJECTED: ${(e as Error).message.slice(0, 200)}`;
    }
}

// --- 2. story pipeline --------------------------------------------------------------------
async function storyRun(effort: string): Promise<void> {
    wireEffort = effort;
    const rolesText = [GAME_ROLES.WEREWOLF, GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC]
        .map(r => ROLE_CONFIGS[r]).map(role => `- **${role.name}** (${role.alignment}): ${role.description}`).join('\n');
    const playStylesText = Object.entries(PLAY_STYLE_CONFIGS).map(([key, cfg]) => `* ${key}: ${cfg.name} - ${cfg.uiDescription}`).join('\n');
    const voiceConfig = getVoiceConfig(getDefaultVoiceProvider());
    const createAgent = (systemPrompt: string) => {
        const agent = makeAgent(GAME_MASTER, systemPrompt);
        configureStoryAgent(agent);
        if (agent.maxOutputTokens !== STORY_MAX_OUTPUT_TOKENS || agent.requestTimeoutMs !== STORY_REQUEST_TIMEOUT_MS) {
            throw new Error('configureStoryAgent did not apply the story profile');
        }
        return agent;
    };
    const start = Date.now();
    try {
        const preview = await generateGamePreview(createAgent, {
            theme: 'Victorian Manor Mystery',
            description: 'A grand estate harbors dark secrets during a stormy night',
            excludedName: 'TestPlayer',
            botCount: 15,
            werewolfCount: 3,
            gameRolesText: rolesText,
            playStylesText,
            voiceConfig,
        });
        const ms = Date.now() - start;
        console.log(`story @${effort}: ${sec(ms)} wall, ${preview.players.length} players, $${costUSD(preview.tokenUsage).toFixed(4)}, out=${preview.tokenUsage?.outputTokens}`);
        for (const stage of preview.stages as unknown[]) {
            console.log('  stage:', JSON.stringify(stage, (_k, v) => typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v));
        }
    } catch (e) {
        console.log(`story @${effort}: FAILED after ${sec(Date.now() - start)}: ${(e as Error).message.slice(0, 300)}`);
    }
}

async function main() {
    console.log(`Mistral Large 4 probe — ${new Date().toISOString()} — model ${MODEL}`);
    console.log(`vote prompt: system ${voteSystemPrompt.length} chars, history ${voteHistory.length} messages`);

    if (PROBE_LEVELS) {
        console.log('\n== level acceptance (tiny ask) ==');
        for (const level of ['none', 'omit', 'low', 'medium', 'high']) {
            console.log(`${level.padEnd(7)} ${await levelProbe(level)}`);
        }
    }

    if (RUN_VOTE) {
        for (const effort of EFFORTS) {
            console.log(`\n== day-2 vote @${effort} × ${RUNS} (60s production timeout) ==`);
            for (let i = 0; i < RUNS; i++) {
                console.log(`run ${i + 1}: ${await voteRun(effort)}`);
            }
        }
    }

    if (STORY_EFFORT) {
        console.log(`\n== story pipeline (15 bots) @${STORY_EFFORT} ==`);
        await storyRun(STORY_EFFORT);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
