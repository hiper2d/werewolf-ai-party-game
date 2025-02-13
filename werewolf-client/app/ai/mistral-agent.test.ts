import dotenv from "dotenv";
dotenv.config();
import { MistralAgent } from "./mistral-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

// Helper function to create a MistralAgent instance
const createAgent = (botName: string, modelType: string): MistralAgent => {
  const instruction = format(BOT_SYSTEM_PROMPT, {
    name: botName,
    personal_story: "A mysterious wanderer with a hidden past",
    temperament: "You have a balanced and thoughtful personality.",
    role: "Villager",
    players_names: "Alice, Bob, Charlie",
    dead_players_names_with_roles: "David (Werewolf)"
  });
  return new MistralAgent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.MISTRAL_K!
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
  it("should return null for ask method to maintain inheritance", async () => {
    const agent = createAgent("TestBot", LLM_CONSTANTS.MISTRAL_2_LARGE);
    const messages = createMessages();
    const response = await agent.ask(messages);
    expect(response).toBeNull();
  });

  describe("askWithSchema", () => {
    const testSchemaResponse = async (modelType: string) => {
      const agent = createAgent("TestBot", modelType);
      const messages: AIMessage[] = [{
        role: 'user',
        content: 'What do you think about the current situation in the village?'
      }];
      const schema = createBotAnswerSchema();
      const response = await agent.askWithSchema(schema, messages);

      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);

      const parsedObj = parseResponseToObj(response);
      expect(parsedObj).toHaveProperty('reply');
      const botAnswer = new BotAnswer(parsedObj.reply);
      expect(botAnswer).toBeInstanceOf(BotAnswer);
      expect(typeof botAnswer.reply).toBe('string');
      expect(botAnswer.reply.length).toBeGreaterThan(0);
    };

    it("should respond with valid schema-based answer using Mistral 2 Large", async () => {
      await testSchemaResponse(LLM_CONSTANTS.MISTRAL_2_LARGE);
    });

    it("should respond with valid schema-based answer using Mistral 3 Small", async () => {
      await testSchemaResponse(LLM_CONSTANTS.MISTRAL_3_SMALL);
    });

    it("should handle API errors", async () => {
      const agent = new MistralAgent(
        "TestBot",
        "Test instruction",
        SupportedAiModels[LLM_CONSTANTS.MISTRAL_2_LARGE].modelApiName,
        "invalid_api_key"
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
  });
});