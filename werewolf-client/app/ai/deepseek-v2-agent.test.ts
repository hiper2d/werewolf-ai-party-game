import dotenv from "dotenv";
dotenv.config();
import { DeepSeekV2Agent } from "./deepseek-v2-agent";
import { AIMessage } from "@/app/api/game-models";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS, GAME_MASTER, GAME_ROLES } from "@/app/api/game-models";

describe("DeepSeekV2Agent integration", () => {
  // Skip tests if no API key is provided
  const hasApiKey = process.env.DEEP_SEEK_K;
  const describeOrSkip = hasApiKey ? describe : describe.skip;
  
  // Helper function to create a DeepSeek agent (focusing on reasoner model only)
  const createAgent = (modelType: string = LLM_CONSTANTS.DEEPSEEK_REASONER): DeepSeekV2Agent => {
    const testBot = {
      name: "TestBot",
      story: "A brilliant strategist with deep analytical capabilities",
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
      play_style: "You think deeply and reason through problems step by step.",
      role: testBot.role,
      werewolf_teammates_section: "",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)",
      bot_context: ""
    });
    
    return new DeepSeekV2Agent(
      testBot.name,
      instruction,
      SupportedAiModels[modelType].modelApiName,
      process.env.DEEP_SEEK_K!,
      0.7,
      true // Enable thinking for reasoner model
    );
  };

  describe("Zod integration with DeepSeek Reasoner", () => {
    describeOrSkip("askWithZodSchema with real API", () => {
      it("should work with Zod schema for bot answers using DeepSeek Reasoner", async () => {
        const agent = createAgent(LLM_CONSTANTS.DEEPSEEK_REASONER);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'Think step by step: What do you think about the current situation in the village after David was revealed as a werewolf?'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages
        );
        
        console.log("\n=== DeepSeek Reasoner Zod Integration Test ===");
        console.log("Response type:", typeof response);
        console.log("Response structure:", Object.keys(response));
        console.log("Thinking length:", thinking.length);
        console.log("Has reasoning content:", thinking.length > 0 ? "Yes" : "No");
        
        // Verify response is properly typed and validated
        expect(response).toHaveProperty('reply');
        expect(typeof response.reply).toBe('string');
        expect(response.reply.length).toBeGreaterThan(0);
        
        // Verify thinking content is available (should be present for reasoner model)
        expect(thinking.length).toBeGreaterThan(0);
        console.log("First 200 chars of reasoning:", thinking.substring(0, 200) + "...");
        
        // Verify token usage
        expect(tokenUsage).toBeDefined();
        expect(tokenUsage!.inputTokens).toBeGreaterThan(0);
        expect(tokenUsage!.outputTokens).toBeGreaterThan(0);
        
        console.log("✅ DeepSeek Reasoner Zod schema validation passed");
        console.log("ℹ️  Note: Schema added to prompt for reasoning model, reasoning content available");
      }, 60000); // Extended timeout for reasoning model
      
      it("should generate a game preview using Zod schema with DeepSeek Reasoner", async () => {
        console.log("\n=== DeepSeek Reasoner Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using DeepSeek Reasoner
        const gmAgent = new DeepSeekV2Agent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_REASONER].modelApiName,
          process.env.DEEP_SEEK_K!,
          0.7,
          true // Enable thinking for story generation
        );

        // Prepare game configuration
        const gamePreview = {
          theme: "Underwater Research Facility",
          description: "A deep-sea research station has lost contact with the surface",
          name: "TestPlayer",
          playerCount: 4,
          werewolfCount: 1,
          specialRoles: [GAME_ROLES.DOCTOR]
        };

        const botCount = gamePreview.playerCount - 1; // exclude human player
        
        // Gather role configurations
        const gameRoleConfigs = [
          ROLE_CONFIGS[GAME_ROLES.WEREWOLF],
          ROLE_CONFIGS[GAME_ROLES.DOCTOR]
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
          content: `Think through this creative writing task step by step: ${userPrompt}`
        }];

        console.log("📝 Requesting game story and characters...");
        console.log("Theme:", gamePreview.theme);
        console.log("Players to generate:", botCount);
        console.log("Model:", "deepseek-reasoner");
        
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

        // Verify reasoning content is available
        expect(thinking.length).toBeGreaterThan(0);
        console.log("\n🧠 Reasoning Process:");
        console.log("Reasoning length:", thinking.length, "characters");
        console.log("First 300 chars:", thinking.substring(0, 300) + "...");

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

        console.log("\n✅ DeepSeek Reasoner game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Reasoning model provides internal thought process via thinking content");
      }, 90000); // Extended timeout for complex reasoning + story generation
    });
    
    it("should handle validation errors gracefully", () => {
      // Test the validation helper functions
      const validData = { reply: "The situation is concerning after David's revelation as a werewolf." };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("The situation is concerning after David's revelation as a werewolf.");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ DeepSeek validation error handling works correctly");
    });
  });
  
  describe("Reasoning model characteristics", () => {
    it("should properly differentiate reasoning vs non-reasoning model behavior", () => {
      // Test that reasoning model is configured correctly
      const reasonerAgent = createAgent(LLM_CONSTANTS.DEEPSEEK_REASONER);
      
      // Verify the reasoner agent has thinking enabled
      expect((reasonerAgent as any).enableThinking).toBe(true);
      expect((reasonerAgent as any).model).toContain('reasoner');
      
      console.log("✅ DeepSeek Reasoner model configuration verified");
      console.log("ℹ️  Note: Reasoning model uses prompt-based schema guidance + thinking content");
    });
  });
});