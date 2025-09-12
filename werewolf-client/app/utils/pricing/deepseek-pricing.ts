/**
 * DeepSeek pricing utilities
 * Re-exports unified utilities with DeepSeek-specific naming for backward compatibility
 */

import { calculateCost, extractDeepSeekTokenUsage, type TokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on DeepSeek pricing
 * @param model - The DeepSeek model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param cacheHitTokens - Number of cached input tokens (optional)
 * @returns Cost in USD
 */
export function calculateDeepSeekCost(
    model: string, 
    inputTokens: number, 
    outputTokens: number,
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, cacheHitTokens);
}

/**
 * Extract token usage from DeepSeek API response
 * @param response - The raw response from DeepSeek API
 * @returns TokenUsage object with extracted values
 */
export interface DeepSeekTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    reasoningTokens?: number;
}

export function extractTokenUsageFromResponse(response: any): DeepSeekTokenUsage | null {
    return extractDeepSeekTokenUsage(response);
}