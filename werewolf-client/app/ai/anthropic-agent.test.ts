import dotenv from "dotenv";
dotenv.config();
import { ClaudeAgent } from "./anthropic-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { ResponseSchema, createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS, GAME_MASTER } from "@/app/api/game-models";

describe("ClaudeAgent integration", () => {
  const setupAgent = (modelConstant: string = LLM_CONSTANTS.CLAUDE_4_SONNET) => {
    const botName = "Claudine";
    const testBot = {
      name: botName,
      story: "A mysterious wanderer with a hidden past",
      role: GAME_ROLES.VILLAGER,
      isAlive: true,
      aiType: modelConstant,
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

    return new ClaudeAgent(
      botName,
      instruction,
      SupportedAiModels[modelConstant as keyof typeof SupportedAiModels].modelApiName,
      process.env.ANTHROPIC_K!,
      false // enableThinking parameter
    );
  }


  it("should respond with a valid schema-based answer", async () => {
    const agent = setupAgent();
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

    // Verify the response has the expected structure
    expect(response).toHaveProperty('reply');
    expect(typeof response.reply).toBe('string');
    expect(response.reply.length).toBeGreaterThan(0);
  });

  it("should handle invalid role type", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [
      {
        role: 'invalid_role' as any,
        content: 'Test message'
      }
    ];

    const schema = BotAnswerZodSchema;
    await expect(agent.askWithZodSchema(schema, messages))
      .rejects
      .toThrow('Unsupported role type: invalid_role');
  });

  it("should handle API errors", async () => {
    const agent = new ClaudeAgent(
      "TestBot",
      "Test instruction",
      SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
      "invalid_api_key",
      false
    );

    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Test message'
      }
    ];

    const schema = BotAnswerZodSchema;
    await expect(agent.askWithZodSchema(schema, messages))
      .rejects
      .toThrow('Failed to get response from Anthropic API');
  });

  describe("Zod integration with Anthropic Claude", () => {
    // Skip tests if no API key is provided
    const hasApiKey = process.env.ANTHROPIC_K;
    const describeOrSkip = hasApiKey ? describe : describe.skip;
    
    // Helper function to create a Claude agent (focusing on Sonnet only)
    const createAgent = (modelType: string = LLM_CONSTANTS.CLAUDE_4_SONNET): ClaudeAgent => {
      const testBot = {
        name: "TestBot",
        story: "A thoughtful strategist with keen observational skills",
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
        play_style: "You are observant and methodical, preferring careful analysis.",
        role: testBot.role,
        werewolf_teammates_section: "",
        players_names: "Alice, Bob, Charlie",
        dead_players_names_with_roles: "David (Werewolf)",
        bot_context: ""
      });
      
      return new ClaudeAgent(
        testBot.name,
        instruction,
        SupportedAiModels[modelType].modelApiName,
        process.env.ANTHROPIC_K!,
        true
      );
    };

    describeOrSkip("askWithZodSchema with real API", () => {
      it("should work with Zod schema for bot answers using Claude Sonnet", async () => {
        const agent = createAgent(LLM_CONSTANTS.CLAUDE_4_SONNET);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'What are your thoughts about the current situation in the village after David was revealed as a werewolf?'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages
        );
        
        console.log("\\n=== Anthropic Claude Zod Integration Test ===");
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
        
        console.log("✅ Claude Sonnet Zod schema validation passed");
        console.log("ℹ️  Note: Uses prompt-based schema descriptions for JSON structure guidance");
      }, 45000);
      
      it("should generate a game preview using Zod schema with Claude Sonnet", async () => {
        console.log("\\n=== Claude Sonnet Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using Claude Sonnet
        const gmAgent = new ClaudeAgent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
          process.env.ANTHROPIC_K!,
          false // No thinking mode for story generation
        );

        // Prepare game configuration
        const gamePreview = {
          theme: "Victorian Manor Mystery",
          description: "A grand estate harbors dark secrets during a stormy night",
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
        ).join('\\n');

        // Format playstyle configurations
        const playStylesText = Object.entries(PLAY_STYLE_CONFIGS).map(([key, config]: [string, any]) => 
          `* ${key}: ${config.name} - ${config.uiDescription}`
        ).join('\\n');

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
        console.log("Model:", SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName);
        
        // Call askWithZodSchema with GameSetupZodSchema
        const [gameSetup, thinking, tokenUsage] = await gmAgent.askWithZodSchema(
          GameSetupZodSchema,
          messages
        );

        console.log("\\n📖 Generated Story Scene:");
        console.log(gameSetup.scene.substring(0, 200) + "...");
        
        console.log("\\n👥 Generated Players:");
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
          console.log("\\n💰 Token Usage:");
          console.log(`Input: ${tokenUsage.inputTokens}`);
          console.log(`Output: ${tokenUsage.outputTokens}`);
          console.log(`Total: ${tokenUsage.totalTokens}`);
          console.log(`Cost: $${tokenUsage.costUSD.toFixed(4)}`);
          
          expect(tokenUsage.inputTokens).toBeGreaterThan(0);
          expect(tokenUsage.outputTokens).toBeGreaterThan(0);
          expect(tokenUsage.totalTokens).toBe(tokenUsage.inputTokens + tokenUsage.outputTokens);
          expect(tokenUsage.costUSD).toBeGreaterThan(0);
        }

        console.log("\\n✅ Claude Sonnet game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Prompt-based schema descriptions ensure structured JSON responses");
      }, 60000); // Extended timeout for complex story generation
    });
    
    it("should handle validation errors gracefully", () => {
      // Test the validation helper functions
      const validData = { reply: "I think we should be more vigilant after David's betrayal." };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("I think we should be more vigilant after David's betrayal.");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ Claude validation error handling works correctly");
    });
    
    it("should demonstrate prompt-based schema approach", () => {
      // Test that Claude agent has the correct configuration
      const agent = createAgent(LLM_CONSTANTS.CLAUDE_4_SONNET);
      
      // Verify the agent is properly configured
      expect((agent as any).client).toBeDefined();
      expect((agent as any).model).toContain('sonnet');
      
      console.log("✅ Claude Sonnet agent configuration verified");
      console.log("ℹ️  Note: Agent uses prompt-based schema descriptions since Anthropic doesn't support native JSON schemas");
      console.log("ℹ️  This ensures compatibility with Claude's natural language understanding");
    });
  });
});
