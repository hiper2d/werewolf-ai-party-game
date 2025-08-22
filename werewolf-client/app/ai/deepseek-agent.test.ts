import dotenv from "dotenv";
dotenv.config();
import { DeepSeekV2Agent } from "./deepseek-v2-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("DeepSeekV2Agent integration", () => {
  const setupAgent = (botName: string, modelType: string, enableThinking: boolean = false): DeepSeekV2Agent => {
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

    return new DeepSeekV2Agent(
      botName,
      instruction,
      SupportedAiModels[modelType].modelApiName,
      process.env.DEEP_SEEK_K!,
      0.7,
      enableThinking
    );
  };

  it("should respond with a valid schema-based answer for introduction using DeepSeek Chat", async () => {
    const agent = setupAgent("DeepSeekBot", LLM_CONSTANTS.DEEPSEEK, false);
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
    expect(response!.length).toBeGreaterThan(0);
    
    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response!);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).toBeDefined();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  });

  it("should respond with a valid schema-based answer for introduction using DeepSeek Reasoner", async () => {
    const agent = setupAgent("DeepSeekReasonerBot", LLM_CONSTANTS.DEEPSEEK, true);
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
    expect(response!.length).toBeGreaterThan(0);
    
    // Parse response and create BotAnswer instance
    const parsedObj = parseResponseToObj(response!);
    expect(parsedObj).toHaveProperty('reply');
    const botAnswer = new BotAnswer(parsedObj.reply);
    expect(botAnswer).toBeInstanceOf(BotAnswer);
    expect(botAnswer.reply).toBeDefined();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for DeepSeek Reasoner

  it("should respond with a valid schema-based answer for suspicion using DeepSeek Chat", async () => {
    const agent = setupAgent("DeepSeekBot", LLM_CONSTANTS.DEEPSEEK, false);
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
    expect(botAnswer.reply).toBeDefined();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  });

  it("should respond with a valid schema-based answer for suspicion using DeepSeek Reasoner", async () => {
    const agent = setupAgent("DeepSeekReasonerBot", LLM_CONSTANTS.DEEPSEEK, true);
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
    expect(botAnswer.reply).toBeDefined();
    expect(typeof botAnswer.reply).toBe('string');
    expect(botAnswer.reply.length).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for DeepSeek Reasoner

  it("should throw error when API response is empty", async () => {
    const agent = setupAgent("DeepSeekBot", LLM_CONSTANTS.DEEPSEEK, false);
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Test message'
      }
    ];
    const schema = createBotAnswerSchema();

    // Mock the OpenAI client to return an empty response
    (agent as any).client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            id: 'test-id',
            object: 'chat.completion',
            created: Date.now(),
            model: 'deepseek-chat',
            choices: [{ message: { content: null } }]
          })
        }
      }
    };

    await expect(agent.askWithSchema(schema, messages))
      .rejects
      .toThrow('Empty or undefined response from DeepSeek API');
  });
});