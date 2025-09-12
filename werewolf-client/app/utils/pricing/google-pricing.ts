/**
 * Google pricing utilities
 * Re-exports unified utilities with Google-specific naming for consistency
 */

import { calculateCost, extractGoogleTokenUsage } from './token-usage-utils';

/**
 * Calculate the cost for token usage based on Google pricing
 * @param model - The Google model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param cacheHitTokens - Number of cached input tokens (optional, when supported)
 * @returns Cost in USD
 */
export function calculateGoogleCost(
    model: string, 
    inputTokens: number, 
    outputTokens: number,
    cacheHitTokens: number = 0
): number {
    return calculateCost(model, inputTokens, outputTokens, cacheHitTokens);
}

/**
 * Extract token usage from Google API response
 * @param response - The raw response from Google API
 * @returns Token usage object with extracted values
 */
export interface GoogleTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export function extractTokenUsageFromResponse(response: any): GoogleTokenUsage | null {
    return extractGoogleTokenUsage(response);
}