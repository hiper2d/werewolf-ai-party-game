import dotenv from "dotenv";
dotenv.config();
import { ClaudeAgent } from "./anthropic-agent";
import { AIMessage, BotAnswer } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { ResponseSchema, createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("ClaudeAgent integration", () => {
  const setupAgent = () => {
    const botName = "Claudine";
    const instruction = format(BOT_SYSTEM_PROMPT, {
      name: botName,
      personal_story: "A mysterious wanderer with a hidden past",
      temperament: "You have a balanced and thoughtful personality.",
      role: "Villager",
      players_names: "Alice, Bob, Charlie",
      dead_players_names_with_roles: "David (Werewolf)"
    });

    return new ClaudeAgent(
      botName,
      instruction,
      SupportedAiModels[LLM_CONSTANTS.CLAUDE_37_SONNET].modelApiName,
      process.env.ANTHROPIC_K!
    );
  }

  it("should return null for ask method to maintain inheritance", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Test message'
      }
    ];
    const response = await agent.ask(messages);
    expect(response).toBeNull();
  });

  it("should respond with a valid schema-based answer", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Who do you suspect might be a werewolf and why?'
      }
    ];

    const schema = createBotAnswerSchema();
    const response = await agent.askWithSchema(schema, messages);

    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);

    // Verify the response is valid JSON matching the schema
    const parsedResponse = JSON.parse(response);
    expect(parsedResponse).toHaveProperty('reply');
    expect(typeof parsedResponse.reply).toBe('string');
    expect(parsedResponse.reply.length).toBeGreaterThan(0);
  });

  it("should handle invalid role type", async () => {
    const agent = setupAgent();
    const messages: AIMessage[] = [
      {
        role: 'invalid_role' as any,
        content: 'Test message'
      }
    ];

    const schema = createBotAnswerSchema();
    await expect(agent.askWithSchema(schema, messages))
      .rejects
      .toThrow('Unsupported role type: invalid_role');
  });

  it("should handle API errors", async () => {
    const agent = new ClaudeAgent(
      "TestBot",
      "Test instruction",
      SupportedAiModels[LLM_CONSTANTS.CLAUDE_37_SONNET].modelApiName,
      "invalid_api_key"
    );

    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Test message'
      }
    ];

    const schema = createBotAnswerSchema();
    await expect(agent.askWithSchema(schema, messages))
      .rejects
      .toThrow('Failed to get response from Anthropic API');
  });
});
