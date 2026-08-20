import { AgentLoggingConfig, AIMessage } from '@/app/api/game-models';
import { GlmAgent } from './glm-agent';
import { BotAnswerZodSchema } from './prompts/zod-schemas';

/**
 * Request-shape guard for the Z.AI agent (mocked, free).
 *
 * GLM-5.3 forces reasoning on and defaults `reasoning_effort` to 'max', whose reasoning
 * tokens count against max_tokens — omitting the parameter caused prod empty-response
 * failures (2026-08-20). These tests pin the wire contract on both request paths so a
 * refactor can't silently drop the effort override or the thinking flag again.
 */

const SILENT_LOGGING: AgentLoggingConfig = {
  enabled: false,
  logSystemPrompt: false,
  history: { enabled: false, maxCharactersPerMessage: 0 },
  logCommand: false,
  reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

const MESSAGES: AIMessage[] = [{ role: 'user', content: 'Say something.' }];

function makeAgent(completion: any): { agent: GlmAgent; captured: { params?: any } } {
  // Real catalog model id so the agent resolves reasoningEffort from ai-models.ts.
  const agent = new GlmAgent('Bot', 'instruction', 'glm-5.3', 'key', 0.7, false, SILENT_LOGGING);
  const captured: { params?: any } = {};
  (agent as any).client = {
    chat: { completions: { create: async (params: any) => { captured.params = params; return completion; } } },
  };
  return { agent, captured };
}

const textCompletion = { choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] };
const jsonCompletion = { choices: [{ message: { content: '{"reply":"hello"}' }, finish_reason: 'stop' }] };

describe('GlmAgent request shape', () => {
  it('askText sends thinking enabled and the catalog reasoning_effort', async () => {
    const { agent, captured } = makeAgent(textCompletion);
    await agent.askText(MESSAGES);

    expect(captured.params.thinking).toEqual({ type: 'enabled' });
    expect(captured.params.reasoning_effort).toBe('high');
    expect(captured.params.max_tokens).toBe(agent.maxOutputTokens);
    expect(captured.params.response_format).toBeUndefined();
  });

  it('askWithZodSchema sends json mode plus the same reasoning params', async () => {
    const { agent, captured } = makeAgent(jsonCompletion);
    await agent.askWithZodSchema(BotAnswerZodSchema, MESSAGES);

    expect(captured.params.thinking).toEqual({ type: 'enabled' });
    expect(captured.params.reasoning_effort).toBe('high');
    expect(captured.params.response_format).toEqual({ type: 'json_object' });
  });

  it('reasoning_effort is a value GLM-5.3 accepts (low | high | max only)', async () => {
    const { agent, captured } = makeAgent(textCompletion);
    await agent.askText(MESSAGES);

    expect(['low', 'high', 'max']).toContain(captured.params.reasoning_effort);
  });

  it('empty content surfaces the finish_reason in the error', async () => {
    const { agent } = makeAgent({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });

    await expect(agent.askText(MESSAGES)).rejects.toThrow('finish_reason: length');
  });
});
