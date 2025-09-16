import dotenv from "dotenv";
dotenv.config();
import { MistralAgent } from "./mistral-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES, TokenUsage } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS, GAME_MASTER } from "@/app/api/game-models";

// Helper function to create a MistralAgent instance
const createAgent = (botName: string, modelType: string): MistralAgent => {
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
    previous_day_summaries: "" // Add missing parameter
  });
  
  // Enable thinking for Magistral model
  const enableThinking = SupportedAiModels[modelType].hasThinking;
  
  return new MistralAgent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.MISTRAL_API_KEY || process.env.MISTRAL_K || "test_key",
    enableThinking
  );
};

// Helper function to create common messages for testing
const createMessages = (): AIMessage[] => {
  return [
    {
      role: 'user',
      content: GM_COMMAND_INTRODUCE_YOURSELF + "\n\n" + HISTORY_PREFIX.replace(
        '%player_name_to_message_list%',
        "Alice: Greetings everyone! I am Alice, a local herbalist.\n" +
        "Bob: Hello, I'm Bob, the village blacksmith."
      )
    }
  ];
};

describe("MistralAgent integration", () => {
  // Skip tests if no API key is provided
  const hasApiKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_K;
  const describeOrSkip = hasApiKey ? describe : describe.skip;
  
  describeOrSkip("askWithZodSchema with real API", () => {
    const testSchemaResponse = async (modelType: string, expectThinking: boolean = false) => {
      const agent = createAgent("TestBot", modelType);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'What do you think about the current situation in the village?'
      }];
      const schema = BotAnswerZodSchema;
      const [response, thinking, tokenUsage] = await agent.askWithZodSchema(schema, messages);

      // Verify response is a parsed object
      expect(typeof response).toBe("object");
      expect(response).toHaveProperty('reply');
      expect(typeof response.reply).toBe('string');
      expect(response.reply.length).toBeGreaterThan(0);

      // Verify it works with BotAnswer class
      const botAnswer = new BotAnswer(response.reply);
      expect(botAnswer).toBeInstanceOf(BotAnswer);
      expect(typeof botAnswer.reply).toBe('string');
      expect(botAnswer.reply.length).toBeGreaterThan(0);
      
      // Verify thinking content for reasoning models
      if (expectThinking) {
        expect(typeof thinking).toBe('string');
        // Thinking content might be empty if the model doesn't generate it
        // but the type should still be string
      } else {
        expect(thinking).toBe('');
      }
      
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
    };


    it("should respond with valid schema-based answer and token usage using Mistral Medium", async () => {
      await testSchemaResponse(LLM_CONSTANTS.MISTRAL_3_MEDIUM, false);
    }, 30000);
    
    it("should respond with valid schema-based answer and token usage using Magistral Medium (JSON format - no thinking)", async () => {
      await testSchemaResponse(LLM_CONSTANTS.MISTRAL_MAGISTRAL, false);
    }, 30000);

  });
  
  describe("error handling", () => {
    it("should handle API errors gracefully", async () => {
      const agent = new MistralAgent(
        "TestBot",
        "Test instruction",
        SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_MEDIUM].modelApiName,
        "invalid_api_key",
        false
      );

      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      const schema = BotAnswerZodSchema;
      await expect(agent.askWithZodSchema(schema, messages))
        .rejects
        .toThrow('Failed to get response from Mistral API');
    });

    it("should handle empty responses", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_3_MEDIUM);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return an empty response
      (agent as any).client.chat.complete = jest.fn().mockResolvedValue({
        choices: []
      });

      const schema = BotAnswerZodSchema;
      await expect(agent.askWithZodSchema(schema, messages))
        .rejects
        .toThrow('Empty or undefined response from Mistral API');
    });
    
    it("should handle missing content in response", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_3_MEDIUM);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return a response without content
      (agent as any).client.chat.complete = jest.fn().mockResolvedValue({
        choices: [{ message: {} }]
      });

      const schema = BotAnswerZodSchema;
      await expect(agent.askWithZodSchema(schema, messages))
        .rejects
        .toThrow('Failed to get response from Mistral API: Invalid response format from Mistral API');
    });
  });
  
  describe("magistral reasoning verification", () => {
    it("should confirm Magistral model works with JSON format (no thinking content due to format constraint)", async () => {
      if (!hasApiKey) {
        console.log("Skipping test - no API key available");
        return;
      }
      
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_MAGISTRAL);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Think step by step: If there are 3 werewolves and we eliminated 1, how many remain?'
      }];
      const schema = BotAnswerZodSchema;
      
      const [response, thinking, tokenUsage] = await agent.askWithZodSchema(schema, messages);
      
      console.log("\n=== Magistral Model with JSON Format ===");
      console.log("Response received:", response ? "Yes" : "No");
      console.log("Thinking content type:", typeof thinking);
      console.log("Thinking content length:", thinking.length);
      
      // Verify response exists and is a parsed object
      expect(response).toBeDefined();
      expect(typeof response).toBe('object');
      expect(response).toHaveProperty('reply');
      expect(typeof response.reply).toBe('string');
      expect(response.reply.length).toBeGreaterThan(0);
      
      // With JSON format, thinking content will be empty (expected behavior)
      expect(typeof thinking).toBe('string');
      expect(thinking).toBe(''); // Should be empty due to JSON format constraint
      
      // Verify token usage
      expect(tokenUsage).toBeDefined();
      expect(tokenUsage?.inputTokens).toBeGreaterThan(0);
      expect(tokenUsage?.outputTokens).toBeGreaterThan(0);
      expect(tokenUsage?.costUSD).toBeGreaterThan(0);
      
      console.log("✅ Magistral model works correctly with JSON format");
      console.log("ℹ️  Note: Thinking content is unavailable when using JSON format (by design)");
    }, 30000);
  });
  
  describe("token usage calculation", () => {
    
    it("should calculate correct costs for Mistral Medium model", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_3_MEDIUM);
      const cost = (agent as any).calculateCost(1000000, 1000000);
      // Based on current implementation: $0.15 per 1M input, $0.45 per 1M output  
      expect(cost).toBeCloseTo(0.6, 2);
    });
    
    it("should calculate correct costs for Magistral Medium model", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_MAGISTRAL);
      const cost = (agent as any).calculateCost(1000000, 1000000);
      // Based on pricing: $4 per 1M input, $12 per 1M output (reasoning models are more expensive)
      expect(cost).toBeCloseTo(16.0, 2);
    });
  });
  
  describe("Zod integration", () => {
    describeOrSkip("askWithZodSchema with real API", () => {
      
      it("should work with Zod schema for bot answers using Magistral", async () => {
        const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_MAGISTRAL);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'Think step by step: What do you think about the current situation in the village?'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages
        );
        
        console.log("\n=== Magistral Zod Integration Test ===");
        console.log("Response type:", typeof response);
        console.log("Response structure:", Object.keys(response));
        console.log("Thinking length (should be empty due to JSON format):", thinking.length);
        
        // Verify response is properly typed and validated
        expect(response).toHaveProperty('reply');
        expect(typeof response.reply).toBe('string');
        expect(response.reply.length).toBeGreaterThan(0);
        
        // Thinking should be empty when using JSON format
        expect(thinking).toBe('');
        
        // Verify token usage
        expect(tokenUsage).toBeDefined();
        expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
        expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
        
        console.log("✅ Magistral Zod schema validation passed");
        console.log("ℹ️  Note: Schema is correctly added to message content, not responseFormat");
      }, 30000);
      
      it("should generate a game preview using Zod schema with Mistral Medium", async () => {
        // Skip test if no API key is available
        const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_K;
        if (!mistralKey) {
          console.log("⚠️ Skipping test: No Mistral API key found in .env file");
          console.log("Add MISTRAL_API_KEY=your-key or MISTRAL_K=your-key to your .env file to run this test");
          return;
        }

        console.log("\n=== Mistral Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using Mistral Medium
        const gmAgent = new MistralAgent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_MEDIUM].modelApiName,
          mistralKey,
          false // No thinking for story generation
        );

        // Prepare game configuration
        const gamePreview = {
          theme: "Victorian London Mystery",
          description: "A mysterious murder has occurred during a foggy night in Victorian London",
          name: "TestPlayer",
          playerCount: 5,
          werewolfCount: 2,
          specialRoles: [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE]
        };

        const botCount = gamePreview.playerCount - 1; // exclude human player
        
        // Gather role configurations
        const gameRoleConfigs = [
          ROLE_CONFIGS[GAME_ROLES.WEREWOLF],
          ROLE_CONFIGS[GAME_ROLES.DOCTOR],
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
        console.log("Model:", "mistral-medium-latest");
        
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

        console.log("\n✅ Mistral game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Schema was correctly added to message content per Mistral docs");
      }, 60000); // Increased timeout for complex story generation
      
      it("should generate a game preview using Zod schema with Magistral Medium", async () => {
        // Skip test if no API key is available
        const mistralKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_K;
        if (!mistralKey) {
          console.log("⚠️ Skipping test: No Mistral API key found in .env file");
          return;
        }

        console.log("\n=== Magistral Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using Magistral Medium
        const gmAgent = new MistralAgent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.MISTRAL_MAGISTRAL].modelApiName,
          mistralKey,
          false // No thinking available with JSON format
        );

        // Prepare game configuration  
        const gamePreview = {
          theme: "Cyberpunk Corporate Intrigue",
          description: "A data heist has gone wrong in a neon-lit megacorp tower",
          name: "TestPlayer", 
          playerCount: 4,
          werewolfCount: 1,
          specialRoles: [GAME_ROLES.DETECTIVE]
        };

        const botCount = gamePreview.playerCount - 1;
        
        // Gather role configurations
        const gameRoleConfigs = [
          ROLE_CONFIGS[GAME_ROLES.WEREWOLF],
          ROLE_CONFIGS[GAME_ROLES.DETECTIVE]
        ];
        
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
          play_styles: playStylesText
        });

        const messages: AIMessage[] = [{
          role: 'user',
          content: userPrompt
        }];

        console.log("📝 Requesting game story and characters...");
        console.log("Theme:", gamePreview.theme);
        console.log("Players to generate:", botCount);
        console.log("Model:", "magistral-medium-latest");
        
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
        
        // Verify each player has required fields
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

        // Thinking should be empty with JSON format
        expect(thinking).toBe('');

        // Check token usage
        if (tokenUsage) {
          console.log("\n💰 Token Usage:");
          console.log(`Input: ${tokenUsage.inputTokens}`);
          console.log(`Output: ${tokenUsage.outputTokens}`);
          console.log(`Total: ${tokenUsage.totalTokens}`);
          console.log(`Cost: $${tokenUsage.costUSD.toFixed(4)} (reasoning model pricing)`);
          
          expect(tokenUsage.inputTokens).toBeGreaterThan(0);
          expect(tokenUsage.outputTokens).toBeGreaterThan(0);
          expect(tokenUsage.totalTokens).toBe(tokenUsage.inputTokens + tokenUsage.outputTokens);
          expect(tokenUsage.costUSD).toBeGreaterThan(0);
        }

        console.log("\n✅ Magistral game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Reasoning model used with JSON format (thinking unavailable but reasoning still internal)");
      }, 60000);
    });
    
    it("should handle validation errors gracefully", () => {
      // Test the validation helper functions
      const validData = { reply: "Hello, village!" };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("Hello, village!");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ Mistral validation error handling works correctly");
    });
  });
});