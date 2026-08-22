/**
 * @hiper2d/llm-agents — multi-provider LLM agent layer.
 *
 * Schema-validated asks (Zod), thinking extraction and CoT-leak defense, a model catalog
 * with per-model tuning defaults and `createCatalog(overrides)`, token usage extraction,
 * and cost accounting (cache tiers, extended context, peak-valley pricing) for 11 providers.
 */

// Core types
export * from './types';

// Injectable logging
export * from './logger';

// Prompt/cache helpers
export * from './cache-tier';
export * from './text-utils';

// Zod validation + provider schema conversion
export * from './zod-validate';
export * from './zod-schema-converter';
export * from './json-response-parser';

// Provider error taxonomy
export * from './errors';

// Chain-of-thought leak defense
export * from './thinking-utils';

// Model catalog + pricing tables
export * from './catalog';

// Token usage extraction. The provider wire-usage interface shares the name `TokenUsage`
// with the core type in ./types, so it is re-exported here as `ProviderTokenUsage`.
export {
    extractTokenUsage,
    calculateCost,
    extractUsageAndCalculateCost,
    extractDeepSeekTokenUsage,
    extractOpenAITokenUsage,
    extractKimiTokenUsage,
    extractGrokTokenUsage,
    extractAnthropicTokenUsage,
    extractGoogleTokenUsage,
    extractMistralTokenUsage,
} from './pricing/token-usage-utils';
export type { TokenUsage as ProviderTokenUsage } from './pricing/token-usage-utils';

// Provider-specific cost calculators
export {
    calculateOpenAICost,
    extractOpenAITokenUsageFromResponse,
    calculateDeepSeekCost,
    extractDeepSeekTokenUsageFromResponse,
    calculateKimiCost,
    extractKimiTokenUsageFromResponse,
    calculateGrokCost,
    extractGrokTokenUsageFromResponse,
    calculateAnthropicCost,
    extractAnthropicTokenUsageFromResponse,
    calculateGoogleCost,
    extractGoogleTokenUsageFromResponse,
    calculateMistralCost,
    extractMistralTokenUsageFromResponse,
} from './pricing';
export type {
    OpenAITokenUsage,
    DeepSeekTokenUsage,
    KimiTokenUsage,
    GrokTokenUsage,
    AnthropicTokenUsage,
    GoogleTokenUsage,
    MistralTokenUsage,
} from './pricing';

// Agents
export { AbstractAgent } from './agents/abstract-agent';
export { AgentFactory } from './agents/agent-factory';
export { ClaudeAgent } from './agents/anthropic-agent';
export { Gpt5Agent } from './agents/gpt-5-agent';
export { GoogleAgent } from './agents/google-agent';
export { MistralAgent } from './agents/mistral-agent';
export { DeepSeekV2Agent } from './agents/deepseek-v2-agent';
export { GrokAgent } from './agents/grok-agent';
export { KimiAgent } from './agents/kimi-agent';
export { GlmAgent } from './agents/glm-agent';
export { FuguAgent } from './agents/fugu-agent';
export { QwenAgent } from './agents/qwen-agent';
export { MiniMaxAgent } from './agents/minimax-agent';
