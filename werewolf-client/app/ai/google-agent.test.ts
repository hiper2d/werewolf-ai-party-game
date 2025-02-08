import dotenv from "dotenv";
dotenv.config();
import { GoogleAgent } from "./google-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("GoogleAgent integration", () => {
  it("should respond with a valid answer", async () => {
    const botName = "Google Pro Reasoner";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A sophisticated AI with deep analytical capabilities and extensive knowledge.",
      temperament: "You are thoughtful and analytical, considering multiple perspectives before making decisions.",
      role: "Strategic Advisor",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
    });

    const agent = new GoogleAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.GEMINI_2_PRO_EXP].modelApiName,
      process.env.GOOGLE_K!
    );

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
    
    try {
      const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
      console.log('Response:', response);
      
      expect(response).not.toBeNull();
      expect(typeof response).toBe("string");
      expect(response!.length).toBeGreaterThan(0);
      
      // Parse response to BotAnswer
      const parsedResponse = parseResponseToObj(response!) as BotAnswer;
      expect(parsedResponse.reply).not.toBeNull();
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });

  it("should respond with a valid answer using Gemini Flash", async () => {
    const botName = "Google Flash";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A fast and efficient AI assistant.",
      temperament: "You are quick-thinking and precise.",
      role: "Virtual Assistant",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
    });

    const agent = new GoogleAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.GEMINI_2_FLASH].modelApiName,
      process.env.GOOGLE_K!
    );

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
    
    try {
      const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
      console.log('Response:', response);
      
      expect(response).not.toBeNull();
      expect(typeof response).toBe("string");
      expect(response!.length).toBeGreaterThan(0);
      
      // Parse response to BotAnswer
      const parsedResponse = parseResponseToObj(response!) as BotAnswer;
      expect(parsedResponse.reply).not.toBeNull();
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });
});