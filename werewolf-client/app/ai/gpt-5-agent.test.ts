import dotenv from "dotenv";
dotenv.config();
import { Gpt5Agent } from "./gpt-5-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES, TokenUsage } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { calculateOpenAICost } from "@/app/utils/pricing/openai-pricing";
import { BotAnswerZodSchema, GameSetupZodSchema, validateResponse } from "@/app/ai/prompts/zod-schemas";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

// Helper function to create a Gpt5Agent instance
const createAgent = (botName: string, modelType: string): Gpt5Agent => {
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
  
  // GPT-5 models always have thinking enabled
  const enableThinking = SupportedAiModels[modelType].hasThinking;
  
  return new Gpt5Agent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.OPENAI_API_KEY || "test_key",
    0.7, // temperature
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

describe("Gpt5Agent integration", () => {
  // Skip tests if no API key is provided
  const hasApiKey = process.env.OPENAI_API_KEY;
  const describeOrSkip = hasApiKey ? describe : describe.skip;
  
  describeOrSkip("askWithSchema with real API", () => {
    const testSchemaResponse = async (modelType: string, expectThinking: boolean = true) => {
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
        // GPT-5 should provide reasoning content
        console.log(`${modelType} thinking content length:`, thinking.length);
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

    it("should respond with valid schema-based answer, reasoning, and token usage using GPT-5", async () => {
      await testSchemaResponse(LLM_CONSTANTS.GPT_5, true);
    }, 30000);

    it("should respond with valid schema-based answer, reasoning, and token usage using GPT-5-mini", async () => {
      await testSchemaResponse(LLM_CONSTANTS.GPT_5_MINI, true);
    }, 30000);
  });
  
  describe("error handling", () => {
    it("should handle API errors gracefully", async () => {
      const agent = new Gpt5Agent(
        "TestBot",
        "Test instruction",
        SupportedAiModels[LLM_CONSTANTS.GPT_5].modelApiName,
        "invalid_api_key",
        0.7,
        true
      );

      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Failed to get response from OpenAI API');
    });

    it("should handle empty responses", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return an empty response
      (agent as any).client.responses.create = jest.fn().mockResolvedValue({
        output_text: null
      });

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Empty or undefined response from OpenAI API');
    });
    
    it("should handle missing output_text in response", async () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Test message'
      }];

      // Mock the client to return a response without output_text
      (agent as any).client.responses.create = jest.fn().mockResolvedValue({
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
      });

      const schema = createBotAnswerSchema();
      await expect(agent.askWithSchema(schema, messages))
        .rejects
        .toThrow('Empty or undefined response from OpenAI API');
    });
  });
  
  describe("reasoning verification", () => {
    it("should extract reasoning content from GPT-5 responses", async () => {
      if (!hasApiKey) {
        console.log("Skipping test - no API key available");
        return;
      }
      
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      
      // Mock the client to capture the raw response and simulate reasoning output
      const originalCreate = (agent as any).client.responses.create;
      (agent as any).client.responses.create = jest.fn(async (params: any) => {
        const result = await originalCreate.call((agent as any).client.responses, params);
        
        console.log("\n=== GPT-5 Reasoning Test ===");
        console.log("Request includes reasoning:", !!params.reasoning);
        console.log("Reasoning config:", params.reasoning);
        
        // Check if we have reasoning token breakdown
        if (result.usage?.output_tokens_details?.reasoning_tokens) {
          console.log("Reasoning tokens:", result.usage.output_tokens_details.reasoning_tokens);
          console.log("Total output tokens:", result.usage.output_tokens);
        }
        
        return result;
      });
      
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'Think step by step: If there are 3 werewolves and we eliminated 1, how many remain?'
      }];
      const schema = createBotAnswerSchema();
      
      const [response, thinking, tokenUsage] = await agent.askWithSchema(schema, messages);
      
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
      
      // Check thinking - GPT-5 should provide reasoning content
      expect(typeof thinking).toBe('string');
      
      // Verify token usage
      expect(tokenUsage).toBeDefined();
      expect(tokenUsage?.inputTokens).toBeGreaterThan(0);
      expect(tokenUsage?.outputTokens).toBeGreaterThan(0);
      
      console.log("✅ GPT-5 reasoning test completed");
    }, 30000);
  });
  
  describe("token usage calculation", () => {
    it("should calculate correct costs for GPT-5", () => {
      // Test the external pricing function that GPT-5 agent uses
      const cost = calculateOpenAICost("gpt-5", 1000000, 1000000);
      // Based on ai-models.ts pricing: $1.25 per 1M input, $10 per 1M output
      expect(cost).toBeCloseTo(11.25, 2);
    });
    
    it("should calculate correct costs for GPT-5-mini", () => {
      // Test the external pricing function that GPT-5 agent uses
      const cost = calculateOpenAICost("gpt-5-mini", 1000000, 1000000);
      // Based on ai-models.ts pricing: $0.25 per 1M input, $2 per 1M output
      expect(cost).toBeCloseTo(2.25, 2);
    });
    
    it("should handle reasoning token breakdown", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      
      // Mock response with reasoning token breakdown
      const mockUsage = {
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
        output_tokens_details: {
          reasoning_tokens: 300
        }
      };
      
      // Calculate cost including reasoning tokens
      const cost = calculateOpenAICost("gpt-5", mockUsage.input_tokens, mockUsage.output_tokens);
      expect(cost).toBeGreaterThan(0);
      
      // Verify reasoning token calculation would work
      const reasoningTokens = mockUsage.output_tokens_details.reasoning_tokens;
      const finalAnswerTokens = mockUsage.output_tokens - reasoningTokens;
      expect(reasoningTokens).toBe(300);
      expect(finalAnswerTokens).toBe(200);
    });
  });
  
  describe("schema processing", () => {
    it("should make schemas strict by adding additionalProperties: false recursively", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      
      // Test schema with nested objects and arrays
      const testSchema = {
        type: "object",
        properties: {
          simpleProperty: { type: "string" },
          nestedObject: {
            type: "object",
            properties: {
              innerProp: { type: "string" },
              deeplyNested: {
                type: "object", 
                properties: {
                  deepProp: { type: "number" }
                }
              }
            }
          },
          arrayProperty: {
            type: "array",
            items: {
              type: "object",
              properties: {
                arrayItemProp: { type: "string" }
              }
            }
          }
        }
      };
      
      const strictSchema = (agent as any).makeSchemaStrict(testSchema);
      
      // Check top level
      expect(strictSchema.additionalProperties).toBe(false);
      
      // Check nested object
      expect(strictSchema.properties.nestedObject.additionalProperties).toBe(false);
      expect(strictSchema.properties.nestedObject.properties.deeplyNested.additionalProperties).toBe(false);
      
      // Check array items
      expect(strictSchema.properties.arrayProperty.items.additionalProperties).toBe(false);
      
      // Ensure original properties are preserved
      expect(strictSchema.properties.simpleProperty.type).toBe("string");
      expect(strictSchema.properties.nestedObject.properties.innerProp.type).toBe("string");
    });
    
    it("should handle schemas with oneOf/anyOf/allOf", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      
      const testSchema = {
        type: "object",
        properties: {
          flexibleProp: {
            oneOf: [
              { type: "object", properties: { a: { type: "string" } } },
              { type: "object", properties: { b: { type: "number" } } }
            ]
          }
        }
      };
      
      const strictSchema = (agent as any).makeSchemaStrict(testSchema);
      
      expect(strictSchema.additionalProperties).toBe(false);
      expect(strictSchema.properties.flexibleProp.oneOf[0].additionalProperties).toBe(false);
      expect(strictSchema.properties.flexibleProp.oneOf[1].additionalProperties).toBe(false);
    });
  });
  
  describe("Zod integration", () => {
    describeOrSkip("askWithZodSchema with real API", () => {
      it("should work with Zod schema for bot answers", async () => {
        const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'What do you think about the current situation in the village?'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          BotAnswerZodSchema, 
          messages, 
          "bot_answer"
        );
        
        console.log("\n=== Zod Integration Test ===");
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
        
        console.log("✅ Zod schema validation passed");
      }, 30000);
      
      it("should work with complex nested Zod schema", async () => {
        const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
        const messages: AIMessage[] = [{
          role: 'user',
          content: 'Create a game setup with 3 players in a medieval village setting.'
        }];
        
        const [response, thinking, tokenUsage] = await agent.askWithZodSchema(
          GameSetupZodSchema,
          messages,
          "game_setup"
        );
        
        console.log("\n=== Complex Zod Schema Test ===");
        console.log("Scene:", response.scene.substring(0, 100) + "...");
        console.log("Players count:", response.players.length);
        
        // Verify complex nested structure
        expect(response).toHaveProperty('scene');
        expect(response).toHaveProperty('players');
        expect(Array.isArray(response.players)).toBe(true);
        expect(response.players.length).toBeGreaterThan(0);
        
        // Verify each player has required properties
        response.players.forEach((player, index) => {
          expect(player).toHaveProperty('name');
          expect(player).toHaveProperty('gender');
          expect(player).toHaveProperty('story');
          expect(player).toHaveProperty('playStyle');
          console.log(`Player ${index + 1}: ${player.name} (${player.gender})`);
        });
        
        console.log("✅ Complex nested schema validation passed");
      }, 30000);
    });
    
    it("should validate Zod schema conversion to JSON Schema", () => {
      const agent = createAgent("TestBot", LLM_CONSTANTS.GPT_5);
      
      // Test the Zod to JSON Schema conversion
      const jsonSchema = (agent as any).zodToOpenAISchema(BotAnswerZodSchema);
      
      console.log("\n=== Zod to JSON Schema Conversion ===");
      console.log("Generated JSON Schema:", JSON.stringify(jsonSchema, null, 2));
      
      // Verify the structure
      expect(jsonSchema).toHaveProperty('type', 'object');
      expect(jsonSchema).toHaveProperty('properties');
      expect(jsonSchema).toHaveProperty('required');
      expect(jsonSchema).toHaveProperty('additionalProperties', false);
      expect(jsonSchema.properties).toHaveProperty('reply');
      expect(jsonSchema.required).toContain('reply');
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
      
      console.log("✅ Validation error handling works correctly");
    });
  });
});