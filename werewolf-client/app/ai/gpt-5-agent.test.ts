import dotenv from "dotenv";
dotenv.config();
import { Gpt5Agent } from "./gpt-5-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES, TokenUsage, GAME_MASTER } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { calculateOpenAICost } from "@/app/utils/pricing/openai-pricing";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { format } from "@/app/ai/prompts/utils";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS } from "@/app/api/game-models";

// Helper function to create a Gpt5Agent instance (defaults to GPT-5-mini)
const createAgent = (botName: string, modelType: string = LLM_CONSTANTS.GPT_5_MINI, enableThinking: boolean = true): Gpt5Agent => {
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
  
  return new Gpt5Agent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.OPENAI_K || "test_key",
    0.7, // temperature
    enableThinking // Use parameter instead of model default
  );
};

describe("Gpt5Agent integration", () => {
  // Skip tests if no API key is provided
  const hasApiKey = process.env.OPENAI_K;
  const describeOrSkip = hasApiKey ? describe : describe.skip;
  
  describeOrSkip("askWithZodSchema with real API", () => {
    it("should respond with valid schema-based answer using GPT-5-mini (with reasoning)", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5_MINI, true);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'What do you think about the current situation in the village?'
      }];
      
      const [response, thinking, tokenUsage] = await agent.askWithZodSchema(BotAnswerZodSchema, messages);

      console.log("\n=== GPT-5-mini Zod Integration Test (With Reasoning) ===");
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
      
      console.log("✅ GPT-5-mini Zod schema validation passed (with reasoning)");
    }, 60000);

    it("should generate a game preview using Zod schema with GPT-5-mini", async () => {
      console.log("\n=== GPT-5-mini Game Preview Generation with Zod (Real API) ===");
      
      // Create a Game Master agent for story generation using GPT-5-mini
      const gmAgent = new Gpt5Agent(
        GAME_MASTER,
        STORY_SYSTEM_PROMPT,
        SupportedAiModels[LLM_CONSTANTS.GPT_5_MINI].modelApiName,
        process.env.OPENAI_K!,
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
      console.log("Model: gpt-5-mini (with reasoning)");
      
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

      console.log("\n✅ GPT-5-mini game preview generated successfully with Zod schema!");
    }, 60000); // Increased timeout for complex story generation
  });

  describe("error handling", () => {
    it("should handle API errors gracefully", async () => {
      const agent = new Gpt5Agent(
        "TestBot",
        "Test instruction",
        SupportedAiModels[LLM_CONSTANTS.GPT_5_MINI].modelApiName,
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
        .toThrow('Failed to get response from OpenAI API');
    });
  });
  
  describe("token usage calculation", () => {
    it("should calculate correct costs for GPT-5-mini", () => {
      // Test the external pricing function that GPT-5 agent uses
      const cost = calculateOpenAICost("gpt-5-mini", 1000000, 1000000);
      // Based on ai-models.ts pricing: $0.25 per 1M input, $2 per 1M output
      expect(cost).toBeCloseTo(2.25, 2);
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
      
      console.log("✅ GPT-5 validation error handling works correctly");
    });
  });
});