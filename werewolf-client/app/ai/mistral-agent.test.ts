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
  
  describeOrSkip("askWithSchema with real API", () => {
    const testSchemaResponse = async (modelType: string, expectThinking: boolean = false) => {
      const agent = createAgent("TestBot", modelType);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'What do you think about the current situation in the village?'
      }];
      const schema = createBotAnswerSchema();
      const [response, thinking, tokenUsage] = await agent.askWithSchema(schema, messages);

      // Verify response
      expect(typeof response).toBe("string");
      expect(response?.length).toBeGreaterThan(0);

      // Verify the response can be parsed
      const parsedObj = parseResponseToObj(response!);
      expect(parsedObj).toHaveProperty('reply');
      const botAnswer = new BotAnswer(parsedObj.reply);
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

    it("should respond with valid schema-based answer and token usage using Mistral Large", async () => {
      await testSchemaResponse(LLM_CONSTANTS.MISTRAL_2_LARGE, false);
    }, 30000);

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
        SupportedAiModels[LLM_CONSTANTS.MISTRAL_2_LARGE].modelApiName,
        "invalid_api_key",
        false
      );

      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Failed to get response from Mistral API');
    });

    it("should handle empty responses", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_2_LARGE);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return an empty response
      (agent as any).client.chat.complete = jest.fn().mockResolvedValue({
        choices: []
      });

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Empty or undefined response from Mistral API');
    });
    
    it("should handle missing content in response", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_2_LARGE);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return a response without content
      (agent as any).client.chat.complete = jest.fn().mockResolvedValue({
        choices: [{ message: {} }]
      });

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Empty or undefined response from Mistral API');
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
      const schema = createBotAnswerSchema();
      
      const [response, thinking, tokenUsage] = await agent.askWithSchema(schema, messages);
      
      console.log("\n=== Magistral Model with JSON Format ===");
      console.log("Response received:", response ? "Yes" : "No");
      console.log("Thinking content type:", typeof thinking);
      console.log("Thinking content length:", thinking.length);
      
      // Verify response exists and is valid JSON
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
      
      // Parse the JSON to ensure it's valid
      const parsedObj = JSON.parse(response);
      expect(parsedObj).toHaveProperty('reply');
      expect(typeof parsedObj.reply).toBe('string');
      expect(parsedObj.reply.length).toBeGreaterThan(0);
      
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
    it("should calculate correct costs for Mistral Large model", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_2_LARGE);
      const cost = (agent as any).calculateCost(1000000, 1000000);
      // Based on current implementation: $0.15 per 1M input, $0.45 per 1M output
      expect(cost).toBeCloseTo(0.6, 2);
    });
    
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
});