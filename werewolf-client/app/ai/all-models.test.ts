/**
 * Integration test: sends a welcome request through AgentFactory for every model.
 * Skips models whose API key is not set in the environment.
 *
 * Run:  npm test -- --testPathPattern=all-models
 *
 * Env vars (set the ones you have):
 *   OPENAI_K, ANTHROPIC_K, GOOGLE_K, MISTRAL_K, DEEP_SEEK_K, GROK_K, MOONSHOT_K
 */

import dotenv from "dotenv";
dotenv.config();

import { AgentFactory } from "@/app/ai/agent-factory";
import { LLM_CONSTANTS, SupportedAiModels, API_KEY_CONSTANTS } from "@/app/ai/ai-models";
import { ApiKeyMap, AIMessage, GAME_ROLES, PLAY_STYLES } from "@/app/api/game-models";
import { BotAnswerZodSchema } from "@/app/ai/prompts/zod-schemas";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { GM_COMMAND_INTRODUCE_YOURSELF } from "@/app/ai/prompts/gm-commands";
import { format } from "@/app/ai/prompts/utils";

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

describe("All models - welcome request via AgentFactory", () => {
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

        it(`${config.displayName} (${llmType}) should respond to welcome`, async () => {
            const agent = AgentFactory.createAgent(
                BOT_NAME,
                systemPrompt,
                llmType,
                apiKeys,
            );

            const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
                BotAnswerZodSchema,
                messages,
            );

            // Response must be valid
            expect(response).toBeDefined();
            expect(response).toHaveProperty('reply');
            expect(typeof response.reply).toBe('string');
            expect(response.reply.length).toBeGreaterThan(0);

            // Token usage should be present
            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.outputTokens).toBeGreaterThan(0);

            console.log(
                `✅ ${config.displayName}: "${response.reply.substring(0, 80)}..." ` +
                `(${tokenUsage!.totalTokens} tokens, $${tokenUsage!.costUSD.toFixed(4)})`
            );
        }, 120000); // 2 min per model — thinking models can be slow
    }
});

// Models whose askText is expected to return thinking content reliably.
// NOT guaranteed: adaptive-thinking Claude models (Opus 4.8) decide per-request
// and skip thinking on trivial prompts; Grok returns encrypted reasoning; Gemini thought
// summaries and Magistral traces vary. Those are logged instead of asserted.
const THINKING_GUARANTEED = new Set<string>([
    LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING,
    LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING,
    LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING,
    LLM_CONSTANTS.DEEPSEEK_V4_PRO_THINKING,
]);

// GPT-5's plain-text path cannot surface thinking (no schema-injected field, and
// OpenAI does not expose chain-of-thought), so it must return an empty string.
const THINKING_ALWAYS_EMPTY = new Set<string>([
    LLM_CONSTANTS.GPT_5_5,
    LLM_CONSTANTS.GPT_5_4_MINI,
]);

// Unlike JSON compliance (a per-MODEL property — each model can fail at
// schema-following differently), plain-text extraction is a per-PROVIDER CODE
// property: all model variants of a provider run the same askText implementation,
// and the only axis that changes behavior is the thinking toggle (plus Claude's
// adaptive-vs-budget thinking split). One representative per code path is enough.
const TEXT_SWEEP_MODELS = new Set<string>([
    LLM_CONSTANTS.CLAUDE_4_HAIKU,
    LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING,   // budget thinking
    LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING,    // adaptive thinking (may skip thinking)
    LLM_CONSTANTS.DEEPSEEK_V4_FLASH,
    LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING,
    LLM_CONSTANTS.GPT_5_4_MINI,              // single path: thinking never surfaces
    LLM_CONSTANTS.GEMINI_3_FLASH,
    LLM_CONSTANTS.GEMINI_3_FLASH_LITE,
    LLM_CONSTANTS.MISTRAL_4_SMALL,
    LLM_CONSTANTS.MISTRAL_MAGISTRAL,         // structured content array (thinking)
    LLM_CONSTANTS.GROK_4_3,
    LLM_CONSTANTS.GROK_4_3_THINKING,
    LLM_CONSTANTS.KIMI,
    LLM_CONSTANTS.KIMI_THINKING,
    LLM_CONSTANTS.GLM,
    LLM_CONSTANTS.GLM_THINKING,
    LLM_CONSTANTS.FUGU,                      // one representative for the Fugu askText code path
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

            const [reply, thinking, tokenUsage, signature] = await agent.askText(messages);

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
            llmType: LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING,
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
            fromType: LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING,
            toType: LLM_CONSTANTS.GEMINI_3_FLASH,
            signatureField: 'anthropicThinkingSignature' as const,
        },
        {
            fromType: LLM_CONSTANTS.GEMINI_3_FLASH,
            toType: LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING,
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
