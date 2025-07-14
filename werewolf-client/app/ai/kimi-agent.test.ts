import dotenv from "dotenv";
dotenv.config();
import { KimiAgent } from "./kimi-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("KimiAgent integration", () => {
  const setupAgent = (botName: string, modelType: string): KimiAgent => {
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A mysterious wanderer with a hidden past",
      temperament: "You have a balanced and thoughtful personality.",
      role: "Villager",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
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

    const schema = createBotAnswerSchema();
    const response = await agent.askWithSchema(schema, messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);

    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
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
        content: 'Please introduce yourself to the group.'
      }
    ];

    const schema = createBotAnswerSchema();
    const response = await agent.askWithSchema(schema, messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);

    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).not.toBeNull();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for API call
});