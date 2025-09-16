import dotenv from "dotenv";
dotenv.config();
import { KimiAgent } from "./kimi-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS, GAME_MASTER } from "@/app/api/game-models";

describe("KimiAgent integration", () => {
  const setupAgent = (botName: string, modelType: string): KimiAgent => {
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
      previous_day_summaries: ""
    });

    return new KimiAgent(
      botName,
      instruction,
      SupportedAiModels[modelType].modelApiName,
      process.env.MOONSHOT_K!,
      0.6
    );
  };

  it("should respond with a valid schema-based answer for suspicion using Kimi K2", async () => {
    const agent = setupAgent("KimiBot", LLM_CONSTANTS.KIMI_K2);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Who do you suspect might be a werewolf and why?'
      }
    ];

    const schema = BotAnswerZodSchema;
    const [response, thinking] = await agent.askWithZodSchema(schema, messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("object");
    expect(response).toHaveProperty('reply');
    expect(typeof response.reply).toBe('string');
    expect(response.reply.length).toBeGreaterThan(0);

    // Create BotAnswer instance directly from parsed response
    const botAnswer = new BotAnswer(response.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).not.toBeNull();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for API call

  it("should handle introduction request", async () => {
    const agent = setupAgent("KimiBot", LLM_CONSTANTS.KIMI_K2);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Please self to the group.'
      }
    ];

    const schema = BotAnswerZodSchema;
    const [response, thinking] = await agent.askWithZodSchema(schema, messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("object");
    expect(response).toHaveProperty('reply');
    expect(typeof response.reply).toBe('string');
    expect(response.reply.length).toBeGreaterThan(0);

    // Create BotAnswer instance directly from parsed response
    const botAnswer = new BotAnswer(response.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).not.toBeNull();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for API call
  
  describe("Zod integration with Kimi/Moonshot AI", () => {
    // Skip tests if no API key is provided
    const hasApiKey = process.env.MOONSHOT_K;
    const describeOrSkip = hasApiKey ? describe : describe.skip;
    
    // Helper function to create a Kimi agent
    const createAgent = (modelType: string = LLM_CONSTANTS.KIMI_K2): KimiAgent => {
      const testBot = {
        name: "TestBot",
        story: "A clever strategist from the mountains",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: modelType,
        gender: 'neutral' as const,
        voice: 'alloy',
        playStyle: 'analytical'
      };
      
      const instruction = format(BOT_SYSTEM_PROMPT, {
        name: testBot.name,
        personal_story: testBot.story,
        play_style: "You are thoughtful and analytical, preferring careful observation.",
        role: testBot.role,
        werewolf_teammates_section: "",
        players_names: "Alice, Bob, Charlie",
        dead_players_names_with_roles: "David (Werewolf)",
        previous_day_summaries: ""
      });
      
      return new KimiAgent(
        testBot.name,
        instruction,
        SupportedAiModels[modelType].modelApiName,
        process.env.MOONSHOT_K!,
        0.7
      );
    };

    describeOrSkip("askWithZodSchema with real API", () => {
      it("should work with Zod schema for bot answers using Kimi K2", async () => {
        const agent = createAgent(LLM_CONSTANTS.KIMI_K2);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'What are your thoughts about the current situation in the village after David was revealed as a werewolf?'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages
        );
        
        console.log("\n=== Kimi/Moonshot AI Zod Integration Test ===");
        console.log("Response type:", typeof response);
        console.log("Response structure:", Object.keys(response));
        console.log("Thinking length:", thinking.length);
        
        // Verify response is properly typed and validated
        expect(response).toHaveProperty('reply');
        expect(typeof response.reply).toBe('string');
        expect(response.reply.length).toBeGreaterThan(0);
        
        // Verify token usage
        expect(tokenUsage).toBeDefined();
        expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
        expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
        
        console.log("✅ Kimi Zod schema validation passed");
        console.log("ℹ️  Note: Uses OpenAI-compatible JSON mode with fallback to prompt-based schema");
      }, 45000);
      
      it("should generate a game preview using Zod schema with Kimi", async () => {
        console.log("\n=== Kimi Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using Kimi
        const gmAgent = new KimiAgent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.KIMI_K2].modelApiName,
          process.env.MOONSHOT_K!,
          0.7
        );

        // Prepare game configuration
        const gamePreview = {
          theme: "Ancient Temple Mystery",
          description: "Ancient ruins hide dark secrets in the mountain temple",
          name: "TestPlayer",
          playerCount: 4,
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
        console.log("Model:", "moonshot-v1-8k");
        
        // Call askWithZodSchema with GameSetupZodSchema
        const [gameSetup, thinking, tokenUsage] = await gmAgent.askWithZodSchema(
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

        // Check token usage
        if (tokenUsage) {
          console.log("\n💰 Token Usage:");
          console.log(`Input: ${tokenUsage.inputTokens}`);
          console.log(`Output: ${tokenUsage.outputTokens}`);
          console.log(`Total: ${tokenUsage.totalTokens}`);
          console.log(`Cost: $${tokenUsage.costUSD.toFixed(4)}`);
          
          expect(tokenUsage.inputTokens).toBeGreaterThan(0);
          expect(tokenUsage.outputTokens).toBeGreaterThan(0);
          expect(tokenUsage.totalTokens).toBe(tokenUsage.inputTokens + tokenUsage.outputTokens);
          expect(tokenUsage.costUSD).toBeGreaterThan(0);
        }

        console.log("\n✅ Kimi game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Adaptive JSON mode with prompt-based fallback ensures compatibility");
      }, 60000); // Extended timeout for complex story generation
    });
    
    it("should handle validation errors gracefully", () => {
      // Test the validation helper functions
      const validData = { reply: "I think we need to be more cautious after David's revelation." };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("I think we need to be more cautious after David's revelation.");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ Kimi validation error handling works correctly");
    });
    
    it("should demonstrate adaptive JSON mode behavior", () => {
      // Test that Kimi agent has the correct configuration
      const agent = createAgent(LLM_CONSTANTS.KIMI_K2);
      
      // Verify the agent is properly configured
      expect((agent as any).client).toBeDefined();
      expect((agent as any).model).toContain('kimi');
      
      console.log("✅ Kimi agent configuration verified");
      console.log("ℹ️  Note: Agent tries OpenAI-compatible JSON mode first, falls back to prompt-based schema");
      console.log("ℹ️  This ensures maximum compatibility with Kimi/Moonshot AI API");
    });
  });
});