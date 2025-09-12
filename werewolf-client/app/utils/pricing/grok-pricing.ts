/**
 * Grok (xAI) pricing utilities
 * Re-exports unified utilities with Grok-specific naming for backward compatibility
 */

import { calculateCost, extractGrokTokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on Grok pricing
 * @param model - The Grok model name
 * @param inputTokens - Number of input tokens used (prompt_tokens)
 * @param outputTokens - Number of output tokens used (completion_tokens, includes reasoning_tokens)
 * @param cacheHitTokens - Number of cached input tokens (optional, when supported)
 * @returns Cost in USD
 */
export function calculateGrokCost(
    model: string, 
    inputTokens: number, 
    outputTokens: number, 
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, cacheHitTokens);
}

/**
 * Extract token usage from Grok API response
 * @param response - The raw response from Grok API
 * @returns Token usage object with extracted values
 */
export interface GrokTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheHitTokens?: number;
    reasoningTokens?: number;
}

export function extractTokenUsageFromResponse(response: any): GrokTokenUsage | null {
    return extractGrokTokenUsage(response);
}