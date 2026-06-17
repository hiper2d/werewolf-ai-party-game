import dotenv from "dotenv";
dotenv.config();
import { GlmAgent } from "./glm-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES, GAME_MASTER } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { calculateCost } from "@/app/utils/pricing";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { format } from "@/app/ai/prompts/utils";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS } from "@/app/api/game-models";

const createAgent = (botName: string, modelType: string = LLM_CONSTANTS.GLM, enableThinking: boolean = false): GlmAgent => {
    const testBot = {
        name: botName,
        story: "A traveling scholar with hidden depths",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: modelType,
        gender: 'neutral' as const,
        voice: 'alloy',
        playStyle: PLAY_STYLES.NORMAL
    };

    const instruction = format(BOT_SYSTEM_PROMPT, {
        name: testBot.name,
        personal_story: testBot.story,
        play_style: "",
        role: testBot.role,
        human_player_name: "Player",
        werewolf_teammates_section: "",
        players_names: "Alice, Bob, Charlie",
        dead_players_names_with_roles: "David (Werewolf)",
        bot_context: ""
    });

    return new GlmAgent(
        botName,
        instruction,
        SupportedAiModels[modelType].modelApiName,
        process.env.Z_K || "test_key",
        SupportedAiModels[modelType].temperature ?? 0.7,
        enableThinking
    );
};

describe("GlmAgent integration", () => {
    const hasApiKey = !!process.env.Z_K;
    const describeOrSkip = hasApiKey ? describe : describe.skip;

    describeOrSkip("askWithZodSchema with real API", () => {
        it("should respond with valid schema-based answer using GLM-5.1 (no thinking)", async () => {
            const agent = createAgent("TestBot", LLM_CONSTANTS.GLM, false);
            const messages: AIMessage[] = [{
                role: 'user',
                content: 'Briefly share your thoughts about today\'s village discussion.'
            }];

            const [response, thinking, tokenUsage] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

            expect(response).toBeDefined();
            expect(response).toHaveProperty('reply');
            expect(typeof response.reply).toBe('string');
            expect(response.reply.length).toBeGreaterThan(0);

            const botAnswer = new BotAnswer(response.reply);
            expect(botAnswer.reply.length).toBeGreaterThan(0);

            // Thinking should be empty when disabled
            expect(thinking).toBe('');

            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.costUSD).toBeGreaterThan(0);
        }, 60000);

        it("should respond with valid schema-based answer using GLM-5.1 (thinking enabled)", async () => {
            const agent = createAgent("TestBot", LLM_CONSTANTS.GLM_THINKING, true);
            const messages: AIMessage[] = [{
                role: 'user',
                content: 'Who do you suspect might be a werewolf, and why?'
            }];

            const [response, thinking, tokenUsage] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

            expect(response).toHaveProperty('reply');
            expect(typeof response.reply).toBe('string');
            expect(response.reply.length).toBeGreaterThan(0);

            // We don't strictly assert thinking content (the API may or may not return it),
            // but the type must be a string.
            expect(typeof thinking).toBe('string');

            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
            expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
        }, 60000);

        it("should generate a game preview using Zod schema with GLM-5.1", async () => {
            const gmAgent = new GlmAgent(
                GAME_MASTER,
                STORY_SYSTEM_PROMPT,
                SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
                process.env.Z_K!,
                SupportedAiModels[LLM_CONSTANTS.GLM].temperature ?? 0.7,
                false
            );

            const gamePreview = {
                theme: "Misty Harbor Mystery",
                description: "A fog-shrouded port town hides dark secrets",
                name: "TestPlayer",
                playerCount: 5,
                werewolfCount: 1,
                specialRoles: [GAME_ROLES.DETECTIVE]
            };

            const botCount = gamePreview.playerCount - 1;
            const gameRoleConfigs = [ROLE_CONFIGS[GAME_ROLES.WEREWOLF], ROLE_CONFIGS[GAME_ROLES.DETECTIVE]];
            const gameRolesText = gameRoleConfigs.map(role =>
                `- **${role.name}** (${role.alignment}): ${role.description}`
            ).join('\n');
            const playStylesText = Object.entries(PLAY_STYLE_CONFIGS).map(([key, config]: [string, any]) =>
                `* ${key}: ${config.name} - ${config.uiDescription}`
            ).join('\n');

            const userPrompt = format(STORY_USER_PROMPT, {
                theme: gamePreview.theme,
                description: gamePreview.description,
                excluded_name: gamePreview.name,
                number_of_players: botCount,
                game_roles: gameRolesText,
                werewolf_count: gamePreview.werewolfCount,
                play_styles: playStylesText,
                available_voices: "alloy, echo, fable, onyx, nova, shimmer"
            });

            const messages: AIMessage[] = [{ role: 'user', content: userPrompt }];

            const [gameSetup, , tokenUsage] = await gmAgent.askWithZodSchema(GameSetupZodSchema, messages);

            expect(gameSetup).toBeDefined();
            expect(gameSetup.scene).toBeDefined();
            expect(typeof gameSetup.scene).toBe('string');
            expect(gameSetup.scene.length).toBeGreaterThan(50);
            expect(Array.isArray(gameSetup.players)).toBe(true);
            expect(gameSetup.players.length).toBe(botCount);

            for (const player of gameSetup.players) {
                expect(typeof player.name).toBe('string');
                expect(player.name.length).toBeGreaterThan(0);
                // The story-gen prompt now requires ASCII-only names.
                expect(player.name).toMatch(/^[A-Za-z0-9]+$/);
                expect(['male', 'female', 'neutral']).toContain(player.gender);
                expect(typeof player.story).toBe('string');
                expect(player.story.length).toBeGreaterThan(10);
            }

            expect(tokenUsage).toBeDefined();
            expect(tokenUsage!.costUSD).toBeGreaterThan(0);
        }, 90000);
    });

    describe("error handling", () => {
        it("should surface API errors as a Z.AI failure", async () => {
            const agent = new GlmAgent(
                "TestBot",
                "Test instruction",
                SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
                "invalid_key_for_z_ai",
                0.7,
                false
            );
            const messages: AIMessage[] = [{ role: 'user', content: 'Hello' }];

            await expect(agent.askWithZodSchema(BotAnswerZodSchema, messages))
                .rejects
                .toThrow('Failed to get response from Z.AI API');
        });
    });

    describe("robust response parsing", () => {
        // Use a non-API-touching agent instance with a fake key.
        const offlineAgent = new GlmAgent(
            "ParseBot",
            "Test instruction",
            SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
            "fake_key_not_used",
            0.7,
            false
        );
        const parseAndValidate = (offlineAgent as any).parseAndValidate.bind(offlineAgent);

        it("parses clean JSON directly", () => {
            const result = parseAndValidate('{"reply":"hello"}', BotAnswerZodSchema);
            expect(result.reply).toBe('hello');
        });

        it("strips markdown fences then parses", () => {
            const result = parseAndValidate('```json\n{"reply":"hi"}\n```', BotAnswerZodSchema);
            expect(result.reply).toBe('hi');
        });

        it("extracts a JSON object embedded in prose", () => {
            const raw = 'Here is my answer:\n{"reply":"I think Bob did it"}\nThanks.';
            const result = parseAndValidate(raw, BotAnswerZodSchema);
            expect(result.reply).toBe('I think Bob did it');
        });

        it("wraps pure prose as BotAnswer reply (the original GLM thinking-mode bug)", () => {
            const prose = '*draws her sword* I think Bob is the werewolf.';
            const result = parseAndValidate(prose, BotAnswerZodSchema);
            expect(result.reply).toBe(prose);
        });

        it("throws for non-JSON prose against a stricter schema", () => {
            const prose = '*shrugs* I have no idea.';
            // GameSetupZodSchema requires fields beyond just `reply` — wrap fallback should not rescue it.
            expect(() => parseAndValidate(prose, GameSetupZodSchema)).toThrow(/Failed to parse JSON response/);
        });
    });

    describe("token usage calculation", () => {
        it("should calculate correct costs for glm-5.2", () => {
            // Pricing in ai-models.ts: $1.4/M input, $4.4/M output
            const cost = calculateCost("glm-5.2", 1_000_000, 1_000_000);
            expect(cost).toBeCloseTo(5.8, 2);
        });
    });

    describe("validation", () => {
        it("should validate Zod schema responses correctly", () => {
            const validData = { reply: "I think we should focus on who's been quiet today." };
            const invalidData = { message: "Wrong property name" };

            const validResult = validateResponse(BotAnswerZodSchema, validData);
            expect(validResult.reply).toBe(validData.reply);

            expect(() => validateResponse(BotAnswerZodSchema, invalidData)).toThrow();
        });
    });
});
