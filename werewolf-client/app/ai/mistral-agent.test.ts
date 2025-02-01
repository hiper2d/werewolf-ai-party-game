import dotenv from "dotenv";
dotenv.config();
import { MistralAgent } from "./mistral-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";

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
  it("should respond with a valid answer", async () => {
    const botName = "MistralBot";
    const agent = createAgent(botName, LLM_CONSTANTS.MISTRAL_2_LARGE);
    const messages = createMessages();
    const response = await agent.ask(messages);
    
    expect(response).not.toBeNull();
    if(response === null) return;
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);
    
    const parsedResponse: BotAnswer = parseResponseToObj(response) as BotAnswer;
    expect(parsedResponse.reply).not.toBeNull();
  });

  it("should respond with a valid answer using Mistral 3 Small model", async () => {
    const botName = "MistralBotSmall";
    const agent = createAgent(botName, LLM_CONSTANTS.MISTRAL_3_SMALL);
    const messages = createMessages();
    const response = await agent.ask(messages);
    
    expect(response).not.toBeNull();
    if(response === null) return;
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);
    
    const parsedResponse: BotAnswer = parseResponseToObj(response) as BotAnswer;
    expect(parsedResponse.reply).not.toBeNull();
  });
});