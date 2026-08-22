/**
 * Mistral pricing utilities
 * Re-exports unified utilities with Mistral-specific naming for consistency
 */

import { calculateCost, extractMistralTokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on Mistral pricing
 * @param model - The Mistral model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param cacheHitTokens - Number of cached input tokens (optional, when supported)
 * @returns Cost in USD
 */
export function calculateMistralCost(
    model: string, 
    inputTokens: number, 
    outputTokens: number,
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, { cacheHitTokens });
}

/**
 * Extract token usage from Mistral API response
 * @param response - The raw response from Mistral API
 * @returns Token usage object with extracted values
 */
export interface MistralTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export function extractTokenUsageFromResponse(response: any): MistralTokenUsage | null {
    return extractMistralTokenUsage(response);
}
