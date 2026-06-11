import { AIMessage, AgentLoggingConfig } from '@/app/api/game-models';
import { ClaudeAgent } from './anthropic-agent';
import { DeepSeekV2Agent } from './deepseek-v2-agent';
import { Gpt5Agent } from './gpt-5-agent';
import { GoogleAgent } from './google-agent';
import { MistralAgent } from './mistral-agent';
import { GlmAgent } from './glm-agent';
import { KimiAgent } from './kimi-agent';
import { GrokAgent } from './grok-agent';

/**
 * Empty-content guard, one per agent (mocked, free).
 *
 * After the plain-text LLM migration, the throw-on-empty inside each agent's
 * askText() is the ONLY thing standing between an empty model response and a
 * blank discussion message — it feeds the recoverable-error -> user-retry UX.
 * These cases can't be provoked live (providers can't be made to return nothing)
 * and the "empty response" contract never changes, so a mocked unit test is the
 * right (and only) home for this coverage.
 *
 * Each test constructs the real agent, then swaps its SDK client for a stub that
 * returns an empty completion in the exact shape that agent's askText reads.
 */

// Silence agent logging so the suite output stays clean.
const SILENT_LOGGING: AgentLoggingConfig = {
  enabled: false,
  logSystemPrompt: false,
  history: { enabled: false, maxCharactersPerMessage: 0 },
  logCommand: false,
  reply: { mode: 'body-only', maxReplyChars: 0, maxThinkingChars: 0, includeReasoning: false, includeUsage: false },
};

const MESSAGES: AIMessage[] = [{ role: 'user', content: 'Say something.' }];

// Empty-completion shapes per client surface.
const openAiChatEmpty = { chat: { completions: { create: async () => ({ choices: [{ message: { content: '' } }] }) } } };

type AgentCase = { name: string; make: () => any };

const cases: AgentCase[] = [
  {
    name: 'ClaudeAgent',
    make: () => {
      const agent = new ClaudeAgent('Bot', 'instruction', 'claude-test', 'key', false, SILENT_LOGGING);
      // Non-empty content array, but no usable text -> textParts join is '' -> throws.
      (agent as any).client = { messages: { create: async () => ({ content: [{ type: 'text', text: '' }] }) } };
      return agent;
    },
  },
  {
    name: 'DeepSeekV2Agent',
    make: () => {
      const agent = new DeepSeekV2Agent('Bot', 'instruction', 'deepseek-test', 'key', 0.2, false, SILENT_LOGGING);
      (agent as any).client = openAiChatEmpty;
      return agent;
    },
  },
  {
    name: 'Gpt5Agent',
    make: () => {
      const agent = new Gpt5Agent('Bot', 'instruction', 'gpt-test', 'key', 0.2, false, SILENT_LOGGING);
      (agent as any).client = { responses: { create: async () => ({ output_text: '' }) } };
      return agent;
    },
  },
  {
    name: 'GoogleAgent',
    make: () => {
      const agent = new GoogleAgent('Bot', 'instruction', 'gemini-test', 'key', false, SILENT_LOGGING);
      (agent as any).client = { models: { generateContent: async () => ({ text: '' }) } };
      return agent;
    },
  },
  {
    name: 'MistralAgent',
    make: () => {
      const agent = new MistralAgent('Bot', 'instruction', 'mistral-test', 'key', false, SILENT_LOGGING);
      (agent as any).client = { chat: { complete: async () => ({ choices: [{ message: { content: '' } }] }) } };
      return agent;
    },
  },
  {
    name: 'GlmAgent',
    make: () => {
      const agent = new GlmAgent('Bot', 'instruction', 'glm-test', 'key', 0.2, false, SILENT_LOGGING);
      (agent as any).client = openAiChatEmpty;
      return agent;
    },
  },
  {
    name: 'KimiAgent',
    make: () => {
      const agent = new KimiAgent('Bot', 'instruction', 'kimi-test', 'key', 0.2, false, SILENT_LOGGING);
      (agent as any).client = openAiChatEmpty;
      return agent;
    },
  },
  {
    name: 'GrokAgent',
    make: () => {
      const agent = new GrokAgent('Bot', 'instruction', 'grok-test', 'key', 0.2, false, SILENT_LOGGING);
      (agent as any).client = openAiChatEmpty;
      return agent;
    },
  },
];

describe('askText empty-content guard', () => {
  cases.forEach(({ name, make }) => {
    it(`${name}.askText throws on an empty model response`, async () => {
      const agent = make();
      await expect(agent.askText(MESSAGES)).rejects.toThrow();
    });
  });
});
