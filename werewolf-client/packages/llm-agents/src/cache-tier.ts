/**
 * Sentinel that splits a system prompt into cache tiers: [shared static tier, per-agent tier].
 * AbstractAgent splits the instruction on it; providers with explicit cache breakpoints
 * (Anthropic) place one per part, everyone else relies on implicit prefix caching over the
 * joined, marker-free instruction. Consumers embed it between the stable and variable parts
 * of their system prompts.
 */
export const CACHE_TIER_MARKER = '\n<<<CACHE_TIER_BREAK>>>\n';
