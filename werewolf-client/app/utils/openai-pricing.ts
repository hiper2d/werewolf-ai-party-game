/**
 * OpenAI pricing information for token cost calculation
 * Prices are in USD per 1,000 tokens
 * Updated as of January 2025
 * Only includes models supported in the game (from ai-models.ts)
 */

import { SupportedAiModels, API_KEY_CONSTANTS } from '../ai/ai-models';

export interface ModelPricing {
    inputPricePerK: number;  // Price per 1,000 input tokens
    outputPricePerK: number; // Price per 1,000 output tokens
}

// Build OpenAI pricing based on supported models
const buildOpenAIPricing = (): Record<string, ModelPricing> => {
    const pricing: Record<string, ModelPricing> = {};
    
    Object.values(SupportedAiModels).forEach(model => {
        if (model.apiKeyName === API_KEY_CONSTANTS.OPENAI) {
            if (model.modelApiName === 'gpt-5') {
                pricing[model.modelApiName] = {
                    inputPricePerK: 0.020,  // Estimated pricing
                    outputPricePerK: 0.080
                };
            } else if (model.modelApiName === 'gpt-5-mini') {
                pricing[model.modelApiName] = {
                    inputPricePerK: 0.005,  // Estimated pricing
                    outputPricePerK: 0.015
                };
            }
        }
    });
    
    return pricing;
};

// OpenAI model pricing (USD per 1,000 tokens)
// Only includes models that are actually supported in the game
export const OPENAI_PRICING: Record<string, ModelPricing> = buildOpenAIPricing();

/**
 * Calculate the cost for token usage based on OpenAI pricing
 * @param model - The OpenAI model name
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @returns Cost in USD
 */
export function calculateOpenAICost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = OPENAI_PRICING[model];
    
    if (!pricing) {
        console.warn(`No pricing information available for model: ${model}. Using GPT-5 pricing as fallback.`);
        const fallbackPricing = OPENAI_PRICING['gpt-5'];
        if (!fallbackPricing) {
            console.error('No fallback pricing available. Please check OpenAI pricing configuration.');
            return 0;
        }
        return (inputTokens * fallbackPricing.inputPricePerK / 1000) + (outputTokens * fallbackPricing.outputPricePerK / 1000);
    }
    
    const inputCost = (inputTokens * pricing.inputPricePerK) / 1000;
    const outputCost = (outputTokens * pricing.outputPricePerK) / 1000;
    
    return inputCost + outputCost;
}

/**
 * Get pricing information for a specific model
 * @param model - The OpenAI model name
 * @returns ModelPricing object or null if not found
 */
export function getModelPricing(model: string): ModelPricing | null {
    return OPENAI_PRICING[model] || null;
}

/**
 * Check if a model has pricing information available
 * @param model - The OpenAI model name
 * @returns true if pricing is available, false otherwise
 */
export function hasModelPricing(model: string): boolean {
    return model in OPENAI_PRICING;
}