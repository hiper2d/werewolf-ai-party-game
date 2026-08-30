import { AgentLoggingConfig, AIMessage } from '@/app/api/game-models';
import { QwenAgent } from './qwen-agent';
import { BotAnswerZodSchema } from './prompts/zod-schemas';

/**
 * Request-shape guard for the Qwen agent (mocked, free).
 *
 * On Qwen the reasoning knob is `thinking_budget`, not `reasoning_effort` (accepted but a
 * no-op — probed live 2026-08-30, see QwenAgent.thinkingParams). These tests pin that the
 * budget comes from the instance field (catalog default 1024, story override larger) on
 * both request paths, and that effort never leaks onto the wire.
 */

const SILENT_LOGGING: AgentLoggingConfig = {
  enabled: false,
  logSystemPrompt: false,
  history: { enabled: false, maxCharactersPerMessage: 0 },
  logCommand: false,
  reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

const MESSAGES: AIMessage[] = [{ role: 'user', content: 'Say something.' }];

function makeAgent(completion: any, model = 'qwen3.8-flash', thinking = true) {
  const agent = new QwenAgent('Bot', 'instruction', model, 'key', 0.7, thinking, SILENT_LOGGING);
  const captured: { params?: any } = {};
  (agent as any).client = {
    chat: { completions: { create: async (params: any) => { captured.params = params; return completion; } } },
  };
  return { agent, captured };
}

const textCompletion = { choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] };
const jsonCompletion = { choices: [{ message: { content: '{"reply":"hello"}' }, finish_reason: 'stop' }] };

describe('QwenAgent request shape', () => {
  it('askText sends enable_thinking and the catalog thinking_budget, never reasoning_effort', async () => {
    const { agent, captured } = makeAgent(textCompletion);
    await agent.askText(MESSAGES);

    expect(captured.params.enable_thinking).toBe(true);
    expect(captured.params.thinking_budget).toBe(1024);
    expect(captured.params.reasoning_effort).toBeUndefined();
    expect(captured.params.max_tokens).toBe(agent.maxOutputTokens);
  });

  it('askWithZodSchema sends the same thinking params and no response_format', async () => {
    const { agent, captured } = makeAgent(jsonCompletion);
    await agent.askWithZodSchema(BotAnswerZodSchema, MESSAGES);

    expect(captured.params.enable_thinking).toBe(true);
    expect(captured.params.thinking_budget).toBe(1024);
    expect(captured.params.reasoning_effort).toBeUndefined();
    expect(captured.params.response_format).toBeUndefined();
  });

  it('a per-instance budget override (story generation) replaces the catalog budget', async () => {
    const { agent, captured } = makeAgent(jsonCompletion, 'qwen3.8-max');
    agent.thinkingBudgetTokens = 8192;
    agent.reasoningEffort = 'high'; // ignored on Qwen
    await agent.askWithZodSchema(BotAnswerZodSchema, MESSAGES);

    expect(captured.params.thinking_budget).toBe(8192);
    expect(captured.params.reasoning_effort).toBeUndefined();
  });

  it('sends enable_thinking false and no budget when thinking is off', async () => {
    const { agent, captured } = makeAgent(textCompletion, 'qwen3.8-flash', false);
    await agent.askText(MESSAGES);

    expect(captured.params.enable_thinking).toBe(false);
    expect(captured.params.thinking_budget).toBeUndefined();
  });
});
