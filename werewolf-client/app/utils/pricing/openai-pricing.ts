/**
 * OpenAI pricing utilities
 * Re-exports unified utilities with OpenAI-specific naming for backward compatibility
 */

import { calculateCost, extractOpenAITokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on OpenAI pricing
 * @param model - The OpenAI model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param cacheHitTokens - Number of cached input tokens (optional)
 * @returns Cost in USD
 */
export function calculateOpenAICost(
    model: string, 
    inputTokens: number, 
    outputTokens: number,
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, { cacheHitTokens });
}

/**
 * Extract token usage from OpenAI API response
 * @param response - The raw response from OpenAI API
 * @returns Token usage object with extracted values
 */
export interface OpenAITokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheHitTokens?: number;
    reasoningTokens?: number;
}

export function extractTokenUsageFromResponse(response: any): OpenAITokenUsage | null {
    return extractOpenAITokenUsage(response);
}
