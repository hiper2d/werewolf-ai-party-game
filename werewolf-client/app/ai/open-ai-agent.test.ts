import dotenv from "dotenv";
dotenv.config();
import { OpenAiAgent } from "./open-ai-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("OpenAiAgent integration", () => {
  const setupAgent = (botName: string, modelType: string): OpenAiAgent => {
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
      dead_players_names_with_roles: "David (Werewolf)"
    });

    return new OpenAiAgent(
      botName,
      instruction,
      SupportedAiModels[modelType].modelApiName,
      process.env.OPENAI_K!,
      1 // GPT-5 models only support temperature=1
    );
  };

  it("should respond with a valid schema-based answer for suspicion using GPT-5", async () => {
    const agent = setupAgent("OpenAiBot", LLM_CONSTANTS.GPT_5);
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
    expect(response!.length).toBeGreaterThan(0);

    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response!);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).not.toBeNull();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  });

  it("should respond with a valid schema-based answer for introduction using GPT-5-mini", async () => {
    const agent = setupAgent("GPT5MiniBot", LLM_CONSTANTS.GPT_5_MINI);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: `${HISTORY_PREFIX}Alice: Hello everyone! I'm Alice.\nBob: Hi, I'm Bob.\n\n${GM_COMMAND_INTRODUCE_YOURSELF}`
      }
    ];

    const schema = createBotAnswerSchema();
    const response = await agent.askWithSchema(schema, messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);

    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response!);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).not.toBeNull();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  });
});