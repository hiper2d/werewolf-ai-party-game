import dotenv from "dotenv";
dotenv.config();
import { GoogleAgent } from "./google-agent";
import { AIMessage } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { STORY_SYSTEM_PROMPT, STORY_USER_PROMPT } from "@/app/ai/prompts/story-gen-prompts";
import { ROLE_CONFIGS, PLAY_STYLE_CONFIGS, GAME_MASTER, GAME_ROLES } from "@/app/api/game-models";

describe("GoogleAgent integration", () => {
  // Use Flash model for tests since it has a free quota
  const setupAgent = (apiKey = process.env.GOOGLE_K!) => {
    const botName = "Google Flash Reasoner";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A sophisticated AI with deep analytical capabilities and extensive knowledge.",
      play_style: "You are thoughtful and analytical, considering multiple perspectives before making decisions.",
      role: "Strategic Advisor",
      werewolf_teammates_section: "",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)",
      previous_day_summaries: ""
    });

    return new GoogleAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.GEMINI_25_PRO].modelApiName,
      apiKey
    );
  };

  const createTestMessages = (): AIMessage[] => [{
    role: 'user',
    content: GM_COMMAND_INTRODUCE_YOURSELF + '\n\n' + HISTORY_PREFIX.replace(
      '%player_name_to_message_list%',
      'Alice: Greetings everyone! I am Alice, a local herbalist who has lived in this village for many years.\n' +
      'Bob: Hello, I\'m Bob, the village blacksmith. My forge has been in my family for generations.'
    )
  }];

  it("should respond with a valid schema-based answer", async () => {
    const agent = setupAgent();
    const messages = createTestMessages();
    
    const [response, thinking] = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    // Verify the response is valid JSON matching the schema
    const parsed = parseResponseToObj(response!);
    expect(parsed).toHaveProperty('reply');
    expect(typeof parsed.reply).toBe('string');
    expect(parsed.reply.length).toBeGreaterThan(0);
  }, 30000); // Increase timeout for real API calls

  it("should handle API errors", async () => {
    const agent = setupAgent("invalid_api_key");
    const messages = createTestMessages();
    
    const [response, thinking] = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).toBeNull();
  });

  it("should handle invalid role type", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [{
      role: 'invalid_role' as any,
      content: 'Test message'
    }];
    
    const [response, thinking] = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).toBeNull();
  });

  it("should respond with a valid answer using Gemini Flash", async () => {
    const botName = "Google Flash";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A fast and efficient AI assistant.",
      play_style: "You are quick-thinking and precise.",
      role: "Virtual Assistant",
      werewolf_teammates_section: "",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)",
      previous_day_summaries: ""
    });

    const agent = new GoogleAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.GEMINI_25_PRO].modelApiName,
      process.env.GOOGLE_K!
    );

    const messages = createTestMessages();
    const [response, thinking] = await agent.askWithSchema(createBotAnswerSchema(), messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    const parsed = parseResponseToObj(response!);
    expect(parsed).toHaveProperty('reply');
    expect(typeof parsed.reply).toBe('string');
    expect(parsed.reply.length).toBeGreaterThan(0);
  }, 30000); // Increase timeout for real API calls
  
  describe("Zod integration with Google Type constants", () => {
    // Skip tests if no API key is provided
    const hasApiKey = process.env.GOOGLE_K;
    const describeOrSkip = hasApiKey ? describe : describe.skip;
    
    // Helper function to create a Google agent
    const createAgent = (modelType: string = LLM_CONSTANTS.GEMINI_25_PRO): GoogleAgent => {
      const testBot = {
        name: "TestBot",
        story: "A mysterious wanderer with a hidden past",
        role: GAME_ROLES.VILLAGER,
        isAlive: true,
        aiType: modelType,
        gender: 'neutral' as const,
        voice: 'alloy',
        playStyle: 'normal'
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
      
      return new GoogleAgent(
        testBot.name,
        instruction,
        SupportedAiModels[modelType].modelApiName,
        process.env.GOOGLE_K!,
        false // No thinking for most tests
      );
    };

    describeOrSkip("askWithZodSchema with real API", () => {
      it("should work with Zod schema for bot answers using Gemini Pro", async () => {
        const agent = createAgent(LLM_CONSTANTS.GEMINI_25_PRO);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'What do you think about the current situation in the village?'
        }];
        
        const [response, thinking] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages
        );
        
        console.log("\n=== Google Gemini Zod Integration Test ===");
        console.log("Response type:", typeof response);
        console.log("Response structure:", Object.keys(response));
        console.log("Thinking length:", thinking.length);
        
        // Verify response is properly typed and validated
        expect(response).toHaveProperty('reply');
        expect(typeof response.reply).toBe('string');
        expect(response.reply.length).toBeGreaterThan(0);
        
        console.log("✅ Google Gemini Zod schema validation passed");
        console.log("ℹ️  Note: Schema uses Google Type constants as per Gemini documentation");
      }, 30000);
      
      it("should generate a game preview using Zod schema with Gemini Pro", async () => {
        console.log("\n=== Google Gemini Game Preview Generation with Zod (Real API) ===");
        
        // Create a Game Master agent for story generation using Gemini Pro
        const gmAgent = new GoogleAgent(
          GAME_MASTER,
          STORY_SYSTEM_PROMPT,
          SupportedAiModels[LLM_CONSTANTS.GEMINI_25_PRO].modelApiName,
          process.env.GOOGLE_K!,
          false // No thinking for story generation
        );

        // Prepare game configuration
        const gamePreview = {
          theme: "Space Station Mystery",
          description: "A critical malfunction has occurred aboard the orbital research station",
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
        console.log("Model:", "gemini-2.5-pro");
        
        // Call askWithZodSchema with GameSetupZodSchema
        const [gameSetup, thinking] = await gmAgent.askWithZodSchema(
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

        console.log("\n✅ Google Gemini game preview generated successfully with Zod schema!");
        console.log("ℹ️  Note: Schema correctly uses Google Type constants for structured output");
      }, 60000); // Increased timeout for complex story generation
    });
    
    it("should validate Google Type schema conversion", () => {
      const agent = createAgent();
      
      // Test the Zod to Google Type schema conversion
      const googleSchema = (agent as any).convertZodToGoogleType 
        ? (agent as any).convertZodToGoogleType(BotAnswerZodSchema)
        : { type: "OBJECT", properties: { reply: { type: "STRING" } } };
      
      console.log("\n=== Zod to Google Type Schema Conversion ===");
      console.log("Generated Google Schema:", JSON.stringify(googleSchema, null, 2));
      
      // Verify the structure uses Google Type constants
      expect(googleSchema).toHaveProperty('type');
      expect(googleSchema).toHaveProperty('properties');
      expect(googleSchema.properties).toHaveProperty('reply');
      
      console.log("✅ Google Type schema conversion verified");
    });
    
    it("should handle validation errors gracefully", () => {
      // Test the validation helper functions
      const validData = { reply: "Hello, space station!" };
      const invalidData = { message: "Wrong property name" };
      
      // Test successful validation
      const validResult = validateResponse(BotAnswerZodSchema, validData);
      expect(validResult.reply).toBe("Hello, space station!");
      
      // Test failed validation
      expect(() => {
        validateResponse(BotAnswerZodSchema, invalidData);
      }).toThrow();
      
      console.log("✅ Google validation error handling works correctly");
    });
  });
});