import dotenv from "dotenv";
dotenv.config();
import { DeepSeekAgent } from "./deepseek-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";

// Helper function to create a DeepSeekAgent instance
const createAgent = (botName: string, modelType: string, temperature: number): DeepSeekAgent => {
  const instruction = format(BOT_SYSTEM_PROMPT, {
    name: botName,
    personal_story: "A mysterious wanderer with a hidden past",
    temperament: "You have a balanced and thoughtful personality.",
    role: "Villager",
    players_names: "Alice, Bob, Charlie",
    dead_players_names_with_roles: "David (Werewolf)"
  });
  return new DeepSeekAgent(
    botName,
    instruction,
    SupportedAiModels[modelType].modelApiName,
    process.env.DEEP_SEEK_K!,
    temperature
  );
};

// Helper function to create common messages
const createMessages = (): AIMessage[] => {
  return [
    {
      role: 'user',
      content: GM_COMMAND_INTRODUCE_YOURSELF + '\n\n' + HISTORY_PREFIX.replace(
        '%player_name_to_message_list%',
        'Alice: Greetings everyone! I am Alice, a local herbalist who has lived in this village for many years. I take pride in helping our community with natural remedies, though these dark times call for a different kind of healing. I hope my knowledge of people\'s habits might help us identify the werewolves among us.\n' +
        'Bob: Hello, I\'m Bob, the village blacksmith. My forge has been in my family for generations, and I know the sound of every hammer strike on steel. These days, I\'m more concerned with forging alliances than horseshoes. We must work together to root out the evil in our midst.'
      )
    }
  ];
};

describe("DeepSeekAgent integration", () => {
  it("should respond with a valid answer using reasoner model", async () => {
    const botName = "DeepSeekerReasoner";
    const agent = createAgent(botName, LLM_CONSTANTS.DEEPSEEK_REASONER, 0.7);
    const messages = createMessages();
    const response = await agent.ask(messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    const parsedResponse: BotAnswer = parseResponseToObj(response!) as BotAnswer;
    expect(parsedResponse.reply).not.toBeNull();
  });

  it("should respond with a valid answer using chat model", async () => {
    const botName = "DeepSeekerChat";
    const agent = createAgent(botName, LLM_CONSTANTS.DEEPSEEK_CHAT, 0.5);
    const messages = createMessages();
    const response = await agent.ask(messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    const parsedResponse: BotAnswer = parseResponseToObj(response!) as BotAnswer;
    expect(parsedResponse.reply).not.toBeNull();
  });
});