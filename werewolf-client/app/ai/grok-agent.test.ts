import dotenv from "dotenv";
dotenv.config();
import { GrokAgent } from "./grok-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES, TokenUsage, GAME_MASTER } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { calculateGrokCost } from "@/app/utils/pricing";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { format } from "@/app/ai/prompts/utils";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS } from "@/app/api/game-models";

// Helper function to create a GrokAgent instance (defaults to GROK-4)
const createAgent = (botName: string, modelType: string = LLM_CONSTANTS.GROK_4, enableThinking: boolean = true): GrokAgent => {
  const testBot = {
    name: botName,
    story: "A mysterious wanderer with a hidden past",
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
    werewolf_teammates_section: "",
    players_names: "Alice, Bob, Charlie",
    dead_players_names_with_roles: "David (Werewolf)",
    bot_context: ""
  });
  
  return new GrokAgent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.GROK_K || "test_key",
    0.7, // temperature
    enableThinking // Use parameter instead of model default
  );
};

describe("GrokAgent integration", () => {
  // Skip tests if no API key is provided
  const hasApiKey = process.env.GROK_K;
  const describeOrSkip = hasApiKey ? describe : describe.skip;
  
  describeOrSkip("askWithZodSchema with real API", () => {
    it("should respond with valid schema-based answer using grok-4 (with reasoning)", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GROK_4, true);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'What do you think about the current situation in the village?'
      }];
      
      const [response, thinking, tokenUsage] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

      console.log("\n=== Grok-4 Zod Integration Test (With Reasoning) ===");
      console.log("Response type:", typeof response);
      console.log("Response structure:", Object.keys(response));
      console.log("Thinking length:", thinking.length);
      
      // Verify response is a typed object from Zod
      expect(response).toBeDefined();
      expect(typeof response).toBe("object");
      expect(response).toHaveProperty('reply');
      expect(typeof response.reply).toBe('string');
      expect(response.reply.length).toBeGreaterThan(0);

      // Verify it works with BotAnswer class
      const botAnswer = new BotAnswer(response.reply);
      expect(botAnswer).toBeInstanceOf(BotAnswer);
      expect(typeof botAnswer.reply).toBe('string');
      expect(botAnswer.reply.length).toBeGreaterThan(0);
      
      // Verify token usage
      expect(tokenUsage).toBeDefined();
      expect(tokenUsage).toHaveProperty('inputTokens');
      expect(tokenUsage).toHaveProperty('outputTokens');
      expect(tokenUsage).toHaveProperty('totalTokens');
      expect(tokenUsage).toHaveProperty('costUSD');
      expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
      expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
      expect(tokenUsage!.totalTokens).toBeGreaterThan(0);
      expect(tokenUsage!.costUSD).toBeGreaterThan(0);
      
      console.log("✅ Grok-4 Zod schema validation passed (with reasoning)");
    }, 30000);

    it("should generate a game preview using Zod schema with grok-4", async () => {
      console.log("\n=== Grok-4 Game Preview Generation with Zod (Real API) ===");
      
      // Create a Game Master agent for story generation using grok-4
      const gmAgent = new GrokAgent(
        GAME_MASTER,
        STORY_SYSTEM_PROMPT,
        SupportedAiModels[LLM_CONSTANTS.GROK_4].modelApiName,
        process.env.GROK_K!,
        0.7,
        false // Disable reasoning for this test
      );

      // Prepare game configuration
      const gamePreview = {
        theme: "Medieval Castle Mystery",
        description: "A dark secret lurks within the ancient castle walls",
        name: "TestPlayer",
        playerCount: 5,
        werewolfCount: 1,
        specialRoles: [GAME_ROLES.DETECTIVE]
      };

      const botCount = gamePreview.playerCount - 1; // exclude human player
      
      // Gather role configurations
      const gameRoleConfigs = [
        ROLE_CONFIGS[GAME_ROLES.WEREWOLF],
        ROLE_CONFIGS[GAME_ROLES.DETECTIVE]
      ];
      
      const gameRolesText = gameRoleConfigs.map(role => 
        `- **${role.name}** (${role.alignment}): ${role.description}`
      ).join('\n');

      // Format playstyle configurations
      const playStylesText = Object.entries(PLAY_STYLE_CONFIGS).map(([key, config]: [string, any]) => 
        `* ${key}: ${config.name} - ${config.uiDescription}`
      ).join('\n');

      // Create the user prompt
      const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount,
        game_roles: gameRolesText,
        werewolf_count: gamePreview.werewolfCount,
        play_styles: playStylesText
      });

      const messages: AIMessage[] = [{
        role: 'user',
        content: userPrompt
      }];

      console.log("📝 Requesting game story and characters...");
      console.log("Theme:", gamePreview.theme);
      console.log("Players to generate:", botCount);
      console.log("Model: grok-4 (with reasoning)");
      
      // Call askWithZodSchema with GameSetupZodSchema
      const [gameSetup, , tokenUsage] = await gmAgent.askWithZodSchema(
        GameSetupZodSchema,
        messages
      );

      console.log("\n📖 Generated Story Scene:");
      console.log(gameSetup.scene.substring(0, 200) + "...");
      
      console.log("\n👥 Generated Players:");
      gameSetup.players.forEach((player, index) => {
        console.log(`${index + 1}. ${player.name} (${player.gender})`);
        console.log(`   Story: ${player.story.substring(0, 100)}...`);
        console.log(`   PlayStyle: ${player.playStyle}`);
      });

      // Assertions
      expect(gameSetup).toBeDefined();
      expect(gameSetup.scene).toBeDefined();
      expect(typeof gameSetup.scene).toBe('string');
      expect(gameSetup.scene.length).toBeGreaterThan(50);
      
      expect(gameSetup.players).toBeDefined();
      expect(Array.isArray(gameSetup.players)).toBe(true);
      expect(gameSetup.players.length).toBe(botCount);
      
      // Verify each player has all required fields
      gameSetup.players.forEach(player => {
        expect(player.name).toBeDefined();
        expect(typeof player.name).toBe('string');
        expect(player.name.length).toBeGreaterThan(0);
        
        expect(player.gender).toBeDefined();
        expect(['male', 'female', 'neutral']).toContain(player.gender);
        
        expect(player.story).toBeDefined();
        expect(typeof player.story).toBe('string');
        expect(player.story.length).toBeGreaterThan(10);
        
        expect(player.playStyle).toBeDefined();
        expect(typeof player.playStyle).toBe('string');
      });

      console.log("\n✅ Grok-4 game preview generated successfully with Zod schema!");
    }, 60000); // Increased timeout for complex story generation
  });

  describe("error handling", () => {
    it("should handle API errors gracefully", async () => {
      const agent = new GrokAgent(
        "TestBot",
        "Test instruction",
        SupportedAiModels[LLM_CONSTANTS.GROK_4].modelApiName,
        "invalid_api_key",
        0.7,
        false
      );

      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      await expect(agent.askWithZodSchema(BotAnswerZodSchema, messages))
        .rejects
        .toThrow('Failed to get response from Grok API');
    });
  });
  
  describe("token usage calculation", () => {
    it("should calculate correct costs for grok-4", () => {
      // Test the external pricing function that Grok agent uses
      const cost = calculateGrokCost("grok-4", 1000000, 1000000);
      // Based on ai-models.ts pricing: $3 per 1M input, $15 per 1M output
      expect(cost).toBeCloseTo(18, 2);
    });
  });

  describe("validation", () => {
    it("should validate Zod schema responses correctly", () => {
      // Test the validation helper functions
      const validData = { reply: "Hello, medieval village!" };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("Hello, medieval village!");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ Grok validation error handling works correctly");
    });
  });
});