import dotenv from "dotenv";
dotenv.config();
import { GoogleAgent } from "./google-agent";
import { AIMessage } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("GoogleAgent integration", () => {
  const setupAgent = (apiKey = process.env.GOOGLE_K!) => {
    const botName = "Google Pro Reasoner";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A sophisticated AI with deep analytical capabilities and extensive knowledge.",
      temperament: "You are thoughtful and analytical, considering multiple perspectives before making decisions.",
      role: "Strategic Advisor",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
    });

    return new GoogleAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.GEMINI_25_PRO].modelApiName,
      apiKey
    );
  };

  const createTestMessages = (): AIMessage[] => [{
    role: 'user',
    content: GM_COMMAND_INTRODUCE_YOURSELF + '\n\n' + HISTORY_PREFIX.replace(
      '%player_name_to_message_list%',
      'Alice: Greetings everyone! I am Alice, a local herbalist who has lived in this village for many years.\n' +
      'Bob: Hello, I\'m Bob, the village blacksmith. My forge has been in my family for generations.'
    )
  }];

  it("should respond with a valid schema-based answer", async () => {
    const agent = setupAgent();
    const messages = createTestMessages();
    
    const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    // Verify the response is valid JSON matching the schema
    const parsed = parseResponseToObj(response!);
    expect(parsed).toHaveProperty('reply');
    expect(typeof parsed.reply).toBe('string');
    expect(parsed.reply.length).toBeGreaterThan(0);
  });

  it("should handle API errors", async () => {
    const agent = setupAgent("invalid_api_key");
    const messages = createTestMessages();
    
    const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).toBeNull();
  });

  it("should handle invalid role type", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [{
      role: 'invalid_role' as any,
      content: 'Test message'
    }];
    
    const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
    expect(response).toBeNull();
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
      SupportedAiModels[LLM_CONSTANTS.GEMINI_25_FLASH].modelApiName,
      process.env.GOOGLE_K!
    );

    const messages = createTestMessages();
    const response = await agent.askWithSchema(createBotAnswerSchema(), messages);
    
    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);
    
    const parsed = parseResponseToObj(response!);
    expect(parsed).toHaveProperty('reply');
    expect(typeof parsed.reply).toBe('string');
    expect(parsed.reply.length).toBeGreaterThan(0);
  });
});