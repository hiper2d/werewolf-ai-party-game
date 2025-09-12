/**
 * Anthropic pricing utilities
 * Re-exports unified utilities with Anthropic-specific naming for consistency
 */

import { calculateCost, extractAnthropicTokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on Anthropic pricing
 * @param model - The Anthropic model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param cacheHitTokens - Number of cached input tokens (optional, when supported)
 * @returns Cost in USD
 */
export function calculateAnthropicCost(
    model: string, 
    inputTokens: number, 
    outputTokens: number,
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, cacheHitTokens);
}

/**
 * Extract token usage from Anthropic API response
 * @param response - The raw response from Anthropic API
 * @returns Token usage object with extracted values
 */
export interface AnthropicTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export function extractTokenUsageFromResponse(response: any): AnthropicTokenUsage | null {
    return extractAnthropicTokenUsage(response);
}