import dotenv from "dotenv";
dotenv.config();
import { OpenAiAgent } from "./open-ai-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("OpenAiAgent integration", () => {
  const setupAgent = (botName: string, modelType: string): OpenAiAgent => {
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A mysterious wanderer with a hidden past",
      temperament: "You have a balanced and thoughtful personality.",
      role: "Villager",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
    });

    return new OpenAiAgent(
      botName,
      instruction,
      SupportedAiModels[modelType].modelApiName,
      process.env.OPENAI_K!,
      0.2
    );
  };

  it("should respond with a valid schema-based answer for introduction using GPT-4O", async () => {
    const agent = setupAgent("OpenAiBot", LLM_CONSTANTS.GPT_4O);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: GM_COMMAND_INTRODUCE_YOURSELF + '\n\n' + HISTORY_PREFIX.replace(
          '%player_name_to_message_list%',
          'Alice: Greetings everyone! I am Alice, a local herbalist who has lived in this village for many years. I take pride in helping our community with natural remedies, though these dark times call for a different kind of healing. I hope my knowledge of people\'s habits might help us identify the werewolves among us.\n' +
          'Bob: Hello, I\'m Bob, the village blacksmith. My forge has been in my family for generations, and I know the sound of every hammer strike on steel. These days, I\'m more concerned with forging alliances than horseshoes. We must work together to root out the evil in our midst.'
        )
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
  });

  it("should respond with a valid schema-based answer for introduction using GPT-4O Mini", async () => {
    const agent = setupAgent("OpenAiBotMini", LLM_CONSTANTS.GPT_4O_MINI);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: GM_COMMAND_INTRODUCE_YOURSELF + '\n\n' + HISTORY_PREFIX.replace(
          '%player_name_to_message_list%',
          'Alice: Greetings everyone! I am Alice, a local herbalist who has lived in this village for many years. I take pride in helping our community with natural remedies, though these dark times call for a different kind of healing. I hope my knowledge of people\'s habits might help us identify the werewolves among us.\n' +
          'Bob: Hello, I\'m Bob, the village blacksmith. My forge has been in my family for generations, and I know the sound of every hammer strike on steel. These days, I\'m more concerned with forging alliances than horseshoes. We must work together to root out the evil in our midst.'
        )
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
  });

  it("should respond with a valid schema-based answer for suspicion using GPT-4O", async () => {
    const agent = setupAgent("OpenAiBot", LLM_CONSTANTS.GPT_4O);
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
  });

  it("should respond with a valid schema-based answer for suspicion using GPT-4O Mini", async () => {
    const agent = setupAgent("OpenAiBotMini", LLM_CONSTANTS.GPT_4O_MINI);
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
  });
});