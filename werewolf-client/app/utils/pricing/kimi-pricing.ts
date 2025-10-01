/**
 * Kimi (Moonshot AI) pricing utilities
 * Re-exports unified utilities with Kimi-specific naming for backward compatibility
 */

import { calculateCost, extractKimiTokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on Kimi pricing
 * @param model - The Kimi model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @returns Cost in USD
 */
export function calculateKimiCost(model: string, inputTokens: number, outputTokens: number): number {
    return calculateCost(model, inputTokens, outputTokens);
}

/**
 * Extract token usage from Kimi API response
 * Since Kimi uses OpenAI-compatible format, the response structure should be similar
 * @param response - The raw response from Kimi API
 * @returns Token usage object with extracted values
 */
export interface KimiTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export function extractTokenUsageFromResponse(response: any): KimiTokenUsage | null {
    return extractKimiTokenUsage(response);
}
