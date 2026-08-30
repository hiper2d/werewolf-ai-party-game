import { AgentLoggingConfig, AIMessage } from '@/app/api/game-models';
import { DeepSeekV2Agent } from './deepseek-v2-agent';
import { BotAnswerZodSchema } from './prompts/zod-schemas';

/**
 * Request-shape guard for the DeepSeek agent (mocked, free).
 *
 * DeepSeek V4 defaults `reasoning_effort` to 'high' and has no thinking budget, which in
 * prod meant ~8 reasoning tokens per answer token and 60-100s story generations
 * (2026-08-30). The catalog pins 'low'; these tests make sure both request paths forward
 * it alongside the thinking flag, so a refactor can't silently drop it.
 */

const SILENT_LOGGING: AgentLoggingConfig = {
  enabled: false,
  logSystemPrompt: false,
  history: { enabled: false, maxCharactersPerMessage: 0 },
  logCommand: false,
  reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

const MESSAGES: AIMessage[] = [{ role: 'user', content: 'Say something.' }];

function makeAgent(completion: any, model = 'deepseek-v4-flash', thinking = true) {
  const agent = new DeepSeekV2Agent('Bot', 'instruction', model, 'key', 0.7, thinking, SILENT_LOGGING);
  const captured: { params?: any } = {};
  (agent as any).client = {
    chat: { completions: { create: async (params: any) => { captured.params = params; return completion; } } },
  };
  return { agent, captured };
}

const textCompletion = { choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] };
const jsonCompletion = { choices: [{ message: { content: '{"reply":"hello"}' }, finish_reason: 'stop' }] };

describe('DeepSeekV2Agent request shape', () => {
  it('askText sends thinking enabled and the catalog reasoning_effort', async () => {
    const { agent, captured } = makeAgent(textCompletion);
    await agent.askText(MESSAGES);

    expect(captured.params.thinking).toEqual({ type: 'enabled' });
    expect(captured.params.extra_body).toBeUndefined();
    expect(captured.params.reasoning_effort).toBe('low');
    expect(captured.params.max_tokens).toBe(agent.maxOutputTokens);
    expect(captured.params.temperature).toBeUndefined();
  });

  it('askWithZodSchema sends thinking enabled, the catalog reasoning_effort and JSON mode', async () => {
    const { agent, captured } = makeAgent(jsonCompletion);
    await agent.askWithZodSchema(BotAnswerZodSchema, MESSAGES);

    expect(captured.params.thinking).toEqual({ type: 'enabled' });
    expect(captured.params.extra_body).toBeUndefined();
    expect(captured.params.reasoning_effort).toBe('low');
    expect(captured.params.response_format).toEqual({ type: 'json_object' });
  });

  it('pins low on both V4 models', async () => {
    const { agent, captured } = makeAgent(textCompletion, 'deepseek-v4-pro');
    await agent.askText(MESSAGES);
    expect(captured.params.reasoning_effort).toBe('low');
  });

  it('a per-instance override (story generation) replaces the catalog effort', async () => {
    const { agent, captured } = makeAgent(jsonCompletion);
    agent.reasoningEffort = 'high';
    await agent.askWithZodSchema(BotAnswerZodSchema, MESSAGES);
    expect(captured.params.reasoning_effort).toBe('high');
  });

  it('sends thinking disabled and no reasoning_effort when thinking is off', async () => {
    const { agent, captured } = makeAgent(textCompletion, 'deepseek-v4-flash', false);
    await agent.askText(MESSAGES);

    // Thinking is on by default server-side, so "off" must be sent explicitly (top-level —
    // extra_body is ignored by the API when sent from openai-node).
    expect(captured.params.thinking).toEqual({ type: 'disabled' });
    expect(captured.params.extra_body).toBeUndefined();
    expect(captured.params.reasoning_effort).toBeUndefined();
    expect(captured.params.temperature).toBe(0.7);
  });
});
