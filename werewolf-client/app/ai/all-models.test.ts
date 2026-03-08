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
