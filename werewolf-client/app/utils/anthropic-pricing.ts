/**
 * Anthropic pricing information for token cost calculation
 * Prices are in USD per 1,000,000 tokens (MTok)
 * Updated as of January 2025
 * Only includes models supported in the game (from ai-models.ts)
 */

import { SupportedAiModels, API_KEY_CONSTANTS } from '../ai/ai-models';

export interface ModelPricing {
    inputPricePerMTok: number;  // Price per 1,000,000 input tokens
    outputPricePerMTok: number; // Price per 1,000,000 output tokens
}

// Build Anthropic pricing based on supported models
const buildAnthropicPricing = (): Record<string, ModelPricing> => {
    const pricing: Record<string, ModelPricing> = {};
    
    Object.values(SupportedAiModels).forEach(model => {
        if (model.apiKeyName === API_KEY_CONSTANTS.ANTHROPIC) {
            if (model.modelApiName === 'claude-opus-4-1') {
                pricing[model.modelApiName] = {
                    inputPricePerMTok: 15.00,   // $15 per MTok
                    outputPricePerMTok: 75.00   // $75 per MTok
                };
            } else if (model.modelApiName === 'claude-sonnet-4-0') {
                pricing[model.modelApiName] = {
                    inputPricePerMTok: 3.00,    // $3 per MTok
                    outputPricePerMTok: 15.00   // $15 per MTok
                };
            }
        }
    });
    
    return pricing;
};

// Anthropic model pricing (USD per 1,000,000 tokens)
// Only includes models that are actually supported in the game
export const ANTHROPIC_PRICING: Record<string, ModelPricing> = buildAnthropicPricing();

/**
 * Calculate the cost for token usage based on Anthropic pricing
 * @param model - The Anthropic model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used (includes thinking tokens)
 * @returns Cost in USD
 */
export function calculateAnthropicCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = ANTHROPIC_PRICING[model];
    
    if (!pricing) {
        console.warn(`No pricing information available for model: ${model}. Using Claude Sonnet 4 pricing as fallback.`);
        const fallbackPricing = ANTHROPIC_PRICING['claude-sonnet-4-0'];
        if (!fallbackPricing) {
            console.error('No fallback pricing available. Please check Anthropic pricing configuration.');
            return 0;
        }
        return (inputTokens * fallbackPricing.inputPricePerMTok / 1000000) + (outputTokens * fallbackPricing.outputPricePerMTok / 1000000);
    }
    
    const inputCost = (inputTokens * pricing.inputPricePerMTok) / 1000000;
    const outputCost = (outputTokens * pricing.outputPricePerMTok) / 1000000;
    
    return inputCost + outputCost;
}

/**
 * Get pricing information for a specific model
 * @param model - The Anthropic model name
 * @returns ModelPricing object or null if not found
 */
export function getModelPricing(model: string): ModelPricing | null {
    return ANTHROPIC_PRICING[model] || null;
}

/**
 * Check if a model has pricing information available
 * @param model - The Anthropic model name
 * @returns true if pricing is available, false otherwise
 */
export function hasModelPricing(model: string): boolean {
    return model in ANTHROPIC_PRICING;
}