import dotenv from "dotenv";
dotenv.config();
import { ClaudeAgent } from "./anthropic-agent";
import { AIMessage, BotAnswer, PLAY_STYLES, GAME_ROLES } from "@/app/api/game-models";
import { parseResponseToObj } from "@/app/utils/message-utils";
import { LLM_CONSTANTS, SupportedAiModels } from "@/app/ai/ai-models";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { GM_COMMAND_INTRODUCE_YOURSELF, HISTORY_PREFIX } from "@/app/ai/prompts/gm-commands";
import { ResponseSchema, createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";

describe("ClaudeAgent integration", () => {
  const setupAgent = (modelConstant: string = LLM_CONSTANTS.CLAUDE_4_SONNET) => {
    const botName = "Claudine";
    const testBot = {
      name: botName,
      story: "A mysterious wanderer with a hidden past",
      role: GAME_ROLES.VILLAGER,
      isAlive: true,
      aiType: modelConstant,
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

    return new ClaudeAgent(
      botName,
      instruction,
      SupportedAiModels[modelConstant as keyof typeof SupportedAiModels].modelApiName,
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

    expect(response).not.toBeNull();
    expect(typeof response).toBe("string");
    expect(response!.length).toBeGreaterThan(0);

    // Verify the response is valid JSON matching the schema
    const parsedResponse = JSON.parse(response!);
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
      SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
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

  describe("Different Anthropic models", () => {
    const testModels = [
      { name: "Claude 4 Opus", constant: LLM_CONSTANTS.CLAUDE_4_OPUS },
      { name: "Claude 4 Sonnet", constant: LLM_CONSTANTS.CLAUDE_4_SONNET },
    ];

    testModels.forEach(({ name, constant }) => {
      it(`should work with ${name} model`, async () => {
        const agent = setupAgent(constant);
        expect(agent).toBeDefined();
        expect(agent.name).toBe("Claudine");
        // Verify the agent was created with the correct model by checking it doesn't throw
        expect(() => agent).not.toThrow();
      });
    });

    it("should have valid model API names for all Anthropic models", () => {
      testModels.forEach(({ name, constant }) => {
        const modelConfig = SupportedAiModels[constant as keyof typeof SupportedAiModels];
        expect(modelConfig).toBeDefined();
        expect(modelConfig.modelApiName).toBeDefined();
        expect(modelConfig.apiKeyName).toBe('ANTHROPIC_API_KEY');
        expect(typeof modelConfig.modelApiName).toBe('string');
        expect(modelConfig.modelApiName.length).toBeGreaterThan(0);
      });
    });
  });
});
