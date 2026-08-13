/**
 * Integration test: runs every model through a realistic day-2 VOTE request,
 * built with the exact production code path (system prompt with full game
 * context, real message-history conversion, real vote command). The scenario
 * is reconstructed from a real production game — see
 * test-fixtures/day2-vote-fixture.ts.
 *
 * Each model plays Kenji (villager, alive) on day 2: the context contains the
 * day-1 discussion summary, the full day-1 voting history, the night-1
 * narrative (detective killed), two dead players, and a 20+ message day-2
 * discussion in which the room turns on Kenji — five votes are already cast,
 * all against him. The model votes 6th of 8 as the mob's cornered target and
 * must still return a valid candidate — alive players only, self excluded.
 * This recreates a real prod failure where a cornered bot voted for itself.
 *
 * Skips models whose API key is not set in the environment.
 *
 * Run:  npm test -- --testPathPattern=all-models
 *
 * Env vars (set the ones you have):
 *   OPENAI_K, ANTHROPIC_K, GOOGLE_K, MISTRAL_K, DEEP_SEEK_K, GROK_K, MOONSHOT_K, Z_K, FUGU_K, GW_K, MX_K
 */

import dotenv from "dotenv";
dotenv.config();

import { AgentFactory } from "@/app/ai/agent-factory";
import { LLM_CONSTANTS, SupportedAiModels, API_KEY_CONSTANTS, STORY_MAX_OUTPUT_TOKENS } from "@/app/ai/ai-models";
import {
    ApiKeyMap, AIMessage, GAME_MASTER, GAME_ROLES, GameMessage, MessageType,
    PLAY_STYLE_CONFIGS, ROLE_CONFIGS,
} from "@/app/api/game-models";
import { BotVoteZodSchema, GameSetupZodSchema } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { getDefaultVoiceProvider, getVoiceConfig } from "@/app/ai/voice-config";
import { BOT_SYSTEM_PROMPT, BOT_VOTE_PROMPT, BOT_REMINDER_POSTFIX } from "@/app/ai/prompts/bot-prompts";
import { GM_COMMAND_INTRODUCE_YOURSELF } from "@/app/ai/prompts/gm-commands";
import { format } from "@/app/ai/prompts/utils";
import { convertToAIMessages } from "@/app/utils/message-utils";
import { withPerf, writePerfReport } from "@/app/ai/live-perf-report";
import {
    generateBotContextSection,
    generateWerewolfTeammatesSection,
    generatePlayStyleDescription,
} from "@/app/utils/bot-utils";
import {
    DAY2_VOTE_GAME,
    DAY2_MESSAGES,
    TEST_BOT_NAME,
    VALID_VOTE_TARGETS,
    INVALID_VOTE_TARGETS,
} from "@/app/ai/test-fixtures/day2-vote-fixture";

// Map from API_KEY_CONSTANTS values to env var names
const ENV_KEY_MAP: Record<string, string> = {
    [API_KEY_CONSTANTS.OPENAI]: 'OPENAI_K',
    [API_KEY_CONSTANTS.ANTHROPIC]: 'ANTHROPIC_K',
    [API_KEY_CONSTANTS.GOOGLE]: 'GOOGLE_K',
    [API_KEY_CONSTANTS.MISTRAL]: 'MISTRAL_K',
    [API_KEY_CONSTANTS.DEEPSEEK]: 'DEEP_SEEK_K',
    [API_KEY_CONSTANTS.GROK]: 'GROK_K',
    [API_KEY_CONSTANTS.MOONSHOT]: 'MOONSHOT_K',
    [API_KEY_CONSTANTS.Z_AI]: 'Z_K',
    [API_KEY_CONSTANTS.FUGU]: 'FUGU_K',
    [API_KEY_CONSTANTS.QWEN]: 'GW_K',
    [API_KEY_CONSTANTS.MINIMAX]: 'MX_K',
};

// Build ApiKeyMap from environment
function buildApiKeys(): ApiKeyMap {
    const keys: ApiKeyMap = {};
    for (const [constantName, envName] of Object.entries(ENV_KEY_MAP)) {
        const value = process.env[envName];
        if (value) {
            keys[constantName] = value;
        }
    }
    return keys;
}

// Shared bot system prompt
const BOT_NAME = "TestBot";
const systemPrompt = format(BOT_SYSTEM_PROMPT, {
    name: BOT_NAME,
    personal_story: "A mysterious wanderer with a hidden past",
    play_style: "",
    role: GAME_ROLES.VILLAGER,
    human_player_name: "Player",
    werewolf_teammates_section: "",
    players_names: "Alice, Bob, Charlie, Player",
    dead_players_names_with_roles: "",
    bot_context: "",
});

const welcomeMessage = format(GM_COMMAND_INTRODUCE_YOURSELF, { bot_name: BOT_NAME });

const messages: AIMessage[] = [
    { role: 'user', content: welcomeMessage },
];

const apiKeys = buildApiKeys();

// All model constants except RANDOM
const allModels = Object.entries(LLM_CONSTANTS)
    .filter(([key]) => key !== 'RANDOM')
    .map(([key, value]) => ({ key, llmType: value }));

// Performance table (duration / tokens / cost per model, sorted by speed) — printed after
// the whole file runs and written to logs/live-perf-<ts>.md. Rows are recorded by the
// withPerf() wrappers around the agent calls below.
afterAll(() => {
    writePerfReport();
});

// ---------------------------------------------------------------------------
// Day-2 vote scenario, built with the same code path as bot-actions.ts vote():
// system prompt (with generateBotContextSection), getBotMessages-shaped
// message log, BOT_VOTE_PROMPT command with playstyle reminder,
// convertToAIMessages, askWithZodSchema(BotVoteZodSchema).
// ---------------------------------------------------------------------------

const kenji = DAY2_VOTE_GAME.bots.find(b => b.name === TEST_BOT_NAME)!;

// Mirrors bot-actions.ts vote(): alive bots minus self, plus the human player
const alivePlayerNames = [
    ...DAY2_VOTE_GAME.bots.filter(b => b.isAlive && b.name !== kenji.name).map(b => b.name),
    DAY2_VOTE_GAME.humanPlayerName,
];

const voteSystemPrompt = format(BOT_SYSTEM_PROMPT, {
    name: kenji.name,
    personal_story: kenji.story,
    play_style: "",
    role: kenji.role,
    human_player_name: DAY2_VOTE_GAME.humanPlayerName,
    werewolf_teammates_section: generateWerewolfTeammatesSection(kenji, DAY2_VOTE_GAME),
    players_names: alivePlayerNames.join(", "),
    dead_players_names_with_roles: DAY2_VOTE_GAME.bots
        .filter(b => !b.isAlive)
        .map(b => `${b.name} (${b.role})`)
        .join(", "),
    bot_context: generateBotContextSection(kenji, DAY2_VOTE_GAME),
});

const validTargetsList = alivePlayerNames.map(n => `- ${n}`).join("\n");

// 5 votes are already on the table in the fixture — all against Kenji.
// He votes 6th of 8 as the mob's target; the model must still pick a valid
// candidate (never itself, never a dead player).
const voteCommand: GameMessage = {
    id: null,
    recipientName: kenji.name,
    authorName: GAME_MASTER,
    msg: format(BOT_VOTE_PROMPT, {
        bot_name: kenji.name,
        vote_position: "6",
        total_voters: "8",
        valid_targets: validTargetsList,
        werewolf_vote_note: "",
    }) + format(BOT_REMINDER_POSTFIX, {
        play_style: generatePlayStyleDescription(kenji),
        human_player_name: DAY2_VOTE_GAME.humanPlayerName,
    }),
    messageType: MessageType.GM_COMMAND,
    day: DAY2_VOTE_GAME.currentDay,
    timestamp: Date.now(),
};

const voteHistory: AIMessage[] = convertToAIMessages(kenji.name, [...DAY2_MESSAGES, voteCommand]);

describe("All models - day 2 vote with full game context", () => {
    for (const { key, llmType } of allModels) {
        const config = SupportedAiModels[llmType];
        if (!config) {
            it.skip(`${key} (${llmType}) — no config found`, () => {});
            continue;
        }

        const envVar = ENV_KEY_MAP[config.apiKeyName];
        const hasKey = apiKeys[config.apiKeyName];

        if (!hasKey) {
            it.skip(`${config.displayName} (${llmType}) — ${envVar} not set`, () => {});
            continue;
        }

        it(`${config.displayName} (${llmType}) should cast a valid day-2 vote`, async () => {
            const agent = AgentFactory.createAgent(
                kenji.name,
                voteSystemPrompt,
                llmType,
                apiKeys,
            );

            const [response, thinking, tokenUsage] = await withPerf(
                'Day-2 vote (full game context)',
                config.displayName,
                () => agent.askWithZodSchema(BotVoteZodSchema, voteHistory),
            );

            // Response must match the vote schema
            expect(response).toBeDefined();
            expect(typeof response.who).toBe('string');
            expect(typeof response.why).toBe('string');
            expect(response.why.length).toBeGreaterThan(0);

            // The target must be a live candidate — never a dead player, never self
            expect(INVALID_VOTE_TARGETS).not.toContain(response.who);
            expect(VALID_VOTE_TARGETS).toContain(response.who);

            // Token usage should be present
            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.outputTokens).toBeGreaterThan(0);

            console.log(
                `✅ ${config.displayName} votes ${response.who}: "${response.why.substring(0, 100)}..." ` +
                `(${tokenUsage!.totalTokens} tokens, $${tokenUsage!.costUSD.toFixed(4)})`
            );
        }, 180000); // 3 min per model — large context + thinking models can be slow
    }
});

// Models whose askText is expected to return thinking content reliably.
// NOT guaranteed: adaptive-thinking Claude models (Opus 4.8, Sonnet 5) decide per-request
// and skip thinking on trivial prompts; Grok returns encrypted reasoning; Gemini thought
// summaries and Magistral traces vary. Those are logged instead of asserted.
// Haiku 4.5 still uses budget thinking, so its reasoning is always surfaced.
const THINKING_GUARANTEED = new Set<string>([
    LLM_CONSTANTS.CLAUDE_4_HAIKU,
    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    LLM_CONSTANTS.DEEPSEEK_V4_PRO,
]);

// GPT-5's plain-text path cannot surface thinking (no schema-injected field, and
// OpenAI does not expose chain-of-thought), so it must return an empty string.
const THINKING_ALWAYS_EMPTY = new Set<string>([
    LLM_CONSTANTS.GPT_5_6_SOL,
    LLM_CONSTANTS.GPT_5_6_TERRA,
    LLM_CONSTANTS.GPT_5_6_LUNA,
]);

// Unlike JSON compliance (a per-MODEL property — each model can fail at
// schema-following differently), plain-text extraction is a per-PROVIDER CODE
// property: all model variants of a provider run the same askText implementation,
// and the only axis that changes behavior is the thinking toggle (plus Claude's
// adaptive-vs-budget thinking split). One representative per code path is enough.
const TEXT_SWEEP_MODELS = new Set<string>([
    LLM_CONSTANTS.CLAUDE_4_HAIKU,            // budget thinking
    LLM_CONSTANTS.CLAUDE_4_OPUS,             // adaptive thinking (may skip thinking)
    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    LLM_CONSTANTS.GPT_5_6_LUNA,              // single path: thinking never surfaces
    LLM_CONSTANTS.GEMINI_3_FLASH,
    LLM_CONSTANTS.GEMINI_3_FLASH_LITE,
    LLM_CONSTANTS.MISTRAL_4_SMALL,
    LLM_CONSTANTS.MISTRAL_MAGISTRAL,         // structured content array (thinking)
    LLM_CONSTANTS.GROK_4_6,
    LLM_CONSTANTS.KIMI,
    LLM_CONSTANTS.GLM,
    LLM_CONSTANTS.FUGU_ULTRA,                // one representative for the Fugu askText code path
    LLM_CONSTANTS.QWEN_FLASH,                // one representative for the Qwen askText code path
    LLM_CONSTANTS.MINIMAX,                   // MiniMax askText code path (adaptive thinking)
]);

describe("All models - plain text welcome via askText", () => {
    for (const { key, llmType } of allModels.filter(m => TEXT_SWEEP_MODELS.has(m.llmType))) {
        const config = SupportedAiModels[llmType];
        if (!config) {
            it.skip(`${key} (${llmType}) — no config found`, () => {});
            continue;
        }

        const envVar = ENV_KEY_MAP[config.apiKeyName];
        const hasKey = apiKeys[config.apiKeyName];

        if (!hasKey) {
            it.skip(`${config.displayName} (${llmType}) — ${envVar} not set`, () => {});
            continue;
        }

        it(`${config.displayName} (${llmType}) should answer welcome as plain text`, async () => {
            const agent = AgentFactory.createAgent(
                BOT_NAME,
                systemPrompt,
                llmType,
                apiKeys,
            );

            const [reply, thinking, tokenUsage, signature] = await withPerf(
                'Welcome (plain text)',
                config.displayName,
                () => agent.askText(messages),
            );

            // Must be non-empty plain prose...
            expect(typeof reply).toBe('string');
            expect(reply.trim().length).toBeGreaterThan(0);

            // ...and NOT the old JSON envelope ({"reply": ...} or any JSON object/array)
            let parsedAsJson: unknown = null;
            try {
                parsedAsJson = JSON.parse(reply);
            } catch {
                // good — plain prose does not parse as JSON
            }
            if (parsedAsJson !== null && typeof parsedAsJson === 'object') {
                throw new Error(
                    `${config.displayName} returned a JSON envelope instead of plain text: ${reply.substring(0, 200)}`
                );
            }

            // Token usage should be present
            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.outputTokens).toBeGreaterThan(0);

            // Thinking expectations by model class
            if (THINKING_GUARANTEED.has(llmType)) {
                expect(thinking.length).toBeGreaterThan(0);
            } else if (THINKING_ALWAYS_EMPTY.has(llmType) || !config.hasThinking) {
                expect(thinking).toBe("");
            } else {
                // hasThinking but provider does not guarantee surfacing it — observe only
                console.log(`ℹ️ ${config.displayName}: thinking ${thinking.length > 0 ? `present (${thinking.length} chars)` : 'not surfaced'}`);
            }

            // Claude must return a signature whenever it emitted thinking
            // (required for multi-turn replay). Adaptive models may emit neither.
            if (llmType.startsWith('claude') && thinking.length > 0) {
                expect(signature).toBeDefined();
                expect(signature!.length).toBeGreaterThan(0);
            }

            console.log(
                `✅ ${config.displayName} askText: "${reply.substring(0, 80)}..." ` +
                `(thinking: ${thinking.length} chars, ${tokenUsage!.totalTokens} tokens, $${tokenUsage!.costUSD.toFixed(4)})`
            );
        }, 120000);
    }
});

// Multi-turn thinking signature round-trip: a thinking response fed back as history
// must be accepted by the provider on the next turn. This exercises the
// signature-aware history conversion (convertToAnthropicMessagesWithThinking /
// convertToContents) that otherwise only runs in production.
describe("Thinking signature round-trip via askText", () => {
    const roundTripCases = [
        {
            llmType: LLM_CONSTANTS.CLAUDE_4_HAIKU,
            signatureField: 'anthropicThinkingSignature' as const,
            signatureRequired: true,
        },
        {
            llmType: LLM_CONSTANTS.GEMINI_3_FLASH,
            signatureField: 'googleThoughtSignature' as const,
            signatureRequired: false, // Gemini does not guarantee a signature on every response
        },
    ];

    for (const { llmType, signatureField, signatureRequired } of roundTripCases) {
        const config = SupportedAiModels[llmType];
        const hasKey = config && apiKeys[config.apiKeyName];

        if (!hasKey) {
            it.skip(`${llmType} — API key not set`, () => {});
            continue;
        }

        it(`${config.displayName} (${llmType}) should accept its own thinking response as history`, async () => {
            const agent = AgentFactory.createAgent(BOT_NAME, systemPrompt, llmType, apiKeys);

            const [firstReply, firstThinking, , firstSignature] = await agent.askText(messages);
            expect(firstReply.trim().length).toBeGreaterThan(0);

            if (signatureRequired) {
                expect(firstSignature).toBeDefined();
            } else if (!firstSignature) {
                console.log(`ℹ️ ${config.displayName}: no signature returned — round-trip will drop thinking from history`);
            }

            // Feed the full first turn back as assistant history, as the game does on replay
            const followUp: AIMessage[] = [
                ...messages,
                {
                    role: 'assistant',
                    content: firstReply,
                    thinking: firstThinking || undefined,
                    [signatureField]: firstSignature,
                },
                { role: 'user', content: 'One of the players, Alice, says she does not trust you. Reply to her in 2-3 sentences.' },
            ];

            const [secondReply, , secondUsage] = await agent.askText(followUp);

            expect(typeof secondReply).toBe('string');
            expect(secondReply.trim().length).toBeGreaterThan(0);
            expect(secondUsage).toBeDefined();

            console.log(
                `✅ ${config.displayName} round-trip: "${secondReply.substring(0, 80)}..." ` +
                `(signature ${firstSignature ? 'replayed' : 'absent'})`
            );
        }, 240000); // two sequential thinking calls
    }
});

// Mid-game model switch: the UI lets a user swap a bot's model (updateBotModel),
// so history written by one provider's thinking model — including its thinking
// signature — gets replayed to a different provider. The history converters must
// drop foreign-signed thinking blocks (Claude drops Google-signed, Google drops
// Anthropic-signed) instead of sending them and getting an API rejection.
describe("Cross-provider thinking history swap via askText", () => {
    const swapCases = [
        {
            fromType: LLM_CONSTANTS.CLAUDE_4_HAIKU,
            toType: LLM_CONSTANTS.GEMINI_3_FLASH,
            signatureField: 'anthropicThinkingSignature' as const,
        },
        {
            fromType: LLM_CONSTANTS.GEMINI_3_FLASH,
            toType: LLM_CONSTANTS.CLAUDE_4_HAIKU,
            signatureField: 'googleThoughtSignature' as const,
        },
    ];

    for (const { fromType, toType, signatureField } of swapCases) {
        const fromConfig = SupportedAiModels[fromType];
        const toConfig = SupportedAiModels[toType];
        const hasKeys = fromConfig && toConfig
            && apiKeys[fromConfig.apiKeyName] && apiKeys[toConfig.apiKeyName];

        if (!hasKeys) {
            it.skip(`${fromType} -> ${toType} — API key(s) not set`, () => {});
            continue;
        }

        it(`${fromConfig.displayName} history should replay into ${toConfig.displayName}`, async () => {
            // Turn 1 on the original provider's thinking model
            const fromAgent = AgentFactory.createAgent(BOT_NAME, systemPrompt, fromType, apiKeys);
            const [firstReply, firstThinking, , firstSignature] = await fromAgent.askText(messages);
            expect(firstReply.trim().length).toBeGreaterThan(0);

            if (!firstThinking) {
                console.log(`ℹ️ ${fromConfig.displayName}: no thinking emitted — swap still exercises plain history`);
            }

            // User switches the bot's model; same history replays on the new provider
            const followUp: AIMessage[] = [
                ...messages,
                {
                    role: 'assistant',
                    content: firstReply,
                    thinking: firstThinking || undefined,
                    [signatureField]: firstSignature,
                },
                { role: 'user', content: 'One of the players, Alice, says she does not trust you. Reply to her in 2-3 sentences.' },
            ];

            const toAgent = AgentFactory.createAgent(BOT_NAME, systemPrompt, toType, apiKeys);
            const [secondReply, , secondUsage] = await toAgent.askText(followUp);

            expect(typeof secondReply).toBe('string');
            expect(secondReply.trim().length).toBeGreaterThan(0);
            expect(secondUsage).toBeDefined();

            console.log(
                `✅ ${fromConfig.displayName} -> ${toConfig.displayName}: "${secondReply.substring(0, 80)}..." ` +
                `(foreign thinking ${firstThinking ? `present (${firstThinking.length} chars), must be dropped` : 'absent'})`
            );
        }, 240000);
    }
});

// ---------------------------------------------------------------------------
// Story generation, built with the same code path as game-actions.ts
// createGameWithPreview(): AgentFactory + STORY_SYSTEM_PROMPT, the story cap
// raised to STORY_MAX_OUTPUT_TOKENS, and STORY_USER_PROMPT filled from the real
// role/playstyle/voice config.
//
// This is the one call that emits a character object per bot, so it is where an
// output cap actually binds — and it produced no requestStats rows to size from,
// because the story path bills directly instead of going through
// recordGameMasterTokenUsage. The per-agent live suites cover story generation
// for 8 providers only, construct agents directly rather than through the
// factory (so they never exercise the production cap), and use 3-4 bots. This
// runs every model in the catalog at the largest lobby the UI allows.
// ---------------------------------------------------------------------------

// 16-player lobby (the API-tier maximum in games/newgame) minus the human. The
// point of the test is the worst case: a smaller count clears any sane cap.
const STORY_BOT_COUNT = 15;

const storyRolesText = [
    ROLE_CONFIGS[GAME_ROLES.WEREWOLF],
    ROLE_CONFIGS[GAME_ROLES.DOCTOR],
    ROLE_CONFIGS[GAME_ROLES.DETECTIVE],
    ROLE_CONFIGS[GAME_ROLES.MANIAC],
].map(role => `- **${role.name}** (${role.alignment}): ${role.description}`).join('\n');

const storyPlayStylesText = Object.entries(PLAY_STYLE_CONFIGS)
    .map(([key, cfg]) => `* ${key}: ${cfg.name} - ${cfg.uiDescription}`)
    .join('\n');

const storyUserPrompt = format(STORY_USER_PROMPT, {
    theme: "Victorian Manor Mystery",
    description: "A grand estate harbors dark secrets during a stormy night",
    excluded_name: "TestPlayer",
    number_of_players: STORY_BOT_COUNT,
    game_roles: storyRolesText,
    werewolf_count: 3,
    play_styles: storyPlayStylesText,
    available_voices: getVoiceConfig(getDefaultVoiceProvider()).getPromptDescription(),
});

const storyMessages: AIMessage[] = [{ role: 'user', content: storyUserPrompt }];

describe("All models - story generation at max lobby size", () => {
    for (const { key, llmType } of allModels) {
        const config = SupportedAiModels[llmType];
        if (!config) {
            it.skip(`${key} (${llmType}) — no config found`, () => {});
            continue;
        }

        const envVar = ENV_KEY_MAP[config.apiKeyName];
        if (!apiKeys[config.apiKeyName]) {
            it.skip(`${config.displayName} (${llmType}) — ${envVar} not set`, () => {});
            continue;
        }

        it(`${config.displayName} (${llmType}) should generate ${STORY_BOT_COUNT} characters without truncating`, async () => {
            const agent = AgentFactory.createAgent(GAME_MASTER, STORY_SYSTEM_PROMPT, llmType, apiKeys, false);
            // Mirrors game-actions.ts. Asserted rather than assumed: if that override is ever
            // dropped, story generation silently falls back to the turn-sized default.
            agent.maxOutputTokens = STORY_MAX_OUTPUT_TOKENS;
            expect(agent.maxOutputTokens).toBe(STORY_MAX_OUTPUT_TOKENS);

            const [setup, , tokenUsage] = await withPerf(
                `Story generation (${STORY_BOT_COUNT} bots)`,
                config.displayName,
                // A truncated response cuts the JSON mid-object, so schema parsing throwing
                // here IS the truncation signal — there is no partial-success path.
                () => agent.askWithZodSchema(GameSetupZodSchema, storyMessages),
            );

            expect(setup).toBeDefined();
            expect(typeof setup.scene).toBe('string');
            expect(setup.scene.length).toBeGreaterThan(50);
            expect(Array.isArray(setup.players)).toBe(true);
            expect(setup.players.length).toBe(STORY_BOT_COUNT);

            const validPlayStyles = Object.keys(PLAY_STYLE_CONFIGS);
            for (const player of setup.players) {
                expect(typeof player.name).toBe('string');
                expect(player.name.length).toBeGreaterThan(0);
                expect(player.story.length).toBeGreaterThan(0);
                expect(validPlayStyles).toContain(player.playStyle);
            }
            // Names must be unique — the game keys bots by name.
            expect(new Set(setup.players.map(p => p.name)).size).toBe(STORY_BOT_COUNT);

            // The measurement this test exists to produce: how close the worst realistic
            // story runs to the cap. Anything near 1.0 means STORY_MAX_OUTPUT_TOKENS is
            // too tight for this model and needs a catalog override.
            if (tokenUsage?.outputTokens) {
                const used = tokenUsage.outputTokens / STORY_MAX_OUTPUT_TOKENS;
                console.log(
                    `${config.displayName}: ${tokenUsage.outputTokens} output tokens ` +
                    `(${(used * 100).toFixed(1)}% of the ${STORY_MAX_OUTPUT_TOKENS} story cap)`
                );
                expect(tokenUsage.outputTokens).toBeLessThan(STORY_MAX_OUTPUT_TOKENS);
            }
        }, 240000);
    }
});
