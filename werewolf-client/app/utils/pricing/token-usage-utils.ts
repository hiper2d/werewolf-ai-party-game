/**
 * Unified token usage utilities for all AI providers
 * This module provides a consistent interface for token usage extraction and cost calculation
 * across all supported AI providers (OpenAI, DeepSeek, Kimi, Grok, Anthropic, Google, Mistral)
 */

import { calculateModelCost, CostCalculationOptions } from '../../ai/ai-models';

/**
 * Generic token usage interface that covers all provider-specific fields
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    
    // Cache-related fields (DeepSeek, OpenAI, Kimi, Grok)
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    
    // Reasoning-specific fields (DeepSeek Reasoner, OpenAI o1, etc.)
    reasoningTokens?: number;
    
    // Provider-specific fields can be added here as needed
}

/**
 * Extract token usage from any AI provider's API response
 * This function handles the common response formats used by different providers
 * @param response - The raw API response from any provider
 * @returns TokenUsage object with extracted values or null if extraction fails
 */
export function extractTokenUsage(response: any): TokenUsage | null {
    if (!response?.usage) {
        return null;
    }
    
    const usage = response.usage;
    const result: TokenUsage = {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
    };
    
    // Extract cache information if available (DeepSeek, OpenAI, etc.)
    if (usage.prompt_cache_hit_tokens !== undefined) {
        result.cacheHitTokens = usage.prompt_cache_hit_tokens;
    }
    
    if (usage.prompt_cache_miss_tokens !== undefined) {
        result.cacheMissTokens = usage.prompt_cache_miss_tokens;
    }
    
    // Extract reasoning tokens if available (DeepSeek Reasoner, OpenAI o1, etc.)
    if (usage.completion_tokens_details?.reasoning_tokens !== undefined) {
        result.reasoningTokens = usage.completion_tokens_details.reasoning_tokens;
    }
    
    // Handle other provider-specific formats
    // Anthropic: uses the same format as OpenAI
    // Google: may have different field names, add handling as needed
    // Mistral: uses OpenAI-compatible format
    // Grok: uses OpenAI-compatible format
    
    return result;
}

/**
 * Calculate cost for any AI provider using the centralized pricing
 * @param modelApiName - The API name of the model (e.g., 'gpt-4', 'deepseek-chat')
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used  
 * @param options - Additional calculation details (cache hits, context tokens, etc.)
 * @returns Cost in USD
 */
export function calculateCost(
    modelApiName: string,
    inputTokens: number,
    outputTokens: number,
    options: CostCalculationOptions = {}
): number {
    return calculateModelCost(modelApiName, inputTokens, outputTokens, options);
}

/**
 * Extract token usage and calculate cost in one operation
 * @param modelApiName - The API name of the model
 * @param response - The raw API response from any provider
 * @returns Object with token usage and calculated cost, or null if extraction fails
 */
export function extractUsageAndCalculateCost(modelApiName: string, response: any): {
    usage: TokenUsage;
    cost: number;
} | null {
    const usage = extractTokenUsage(response);
    if (!usage) {
        return null;
    }
    
    const cost = calculateCost(modelApiName, usage.promptTokens, usage.completionTokens, {
        cacheHitTokens: usage.cacheHitTokens || 0,
        totalTokens: usage.totalTokens
    });
    
    return { usage, cost };
}

// Provider-specific extraction functions for cases where custom logic is needed

/**
 * DeepSeek-specific token usage extraction
 * Handles DeepSeek's specific cache and reasoning token fields
 */
export function extractDeepSeekTokenUsage(response: any): TokenUsage | null {
    // Use the generic extractor as DeepSeek follows standard patterns
    return extractTokenUsage(response);
}

/**
 * OpenAI-specific token usage extraction
 * Handles OpenAI's cache tokens and reasoning tokens (for o1 models)
 */
export function extractOpenAITokenUsage(response: any): TokenUsage | null {
    // Use the generic extractor as OpenAI follows standard patterns
    return extractTokenUsage(response);
}

/**
 * Kimi-specific token usage extraction
 * Kimi uses OpenAI-compatible format
 */
export function extractKimiTokenUsage(response: any): TokenUsage | null {
    // Use the generic extractor as Kimi follows OpenAI-compatible patterns
    return extractTokenUsage(response);
}

/**
 * Grok-specific token usage extraction
 * Grok uses OpenAI-compatible format
 */
export function extractGrokTokenUsage(response: any): TokenUsage | null {
    // Use the generic extractor as Grok follows OpenAI-compatible patterns
    return extractTokenUsage(response);
}

/**
 * Anthropic-specific token usage extraction
 * Anthropic may have different response format
 */
export function extractAnthropicTokenUsage(response: any): TokenUsage | null {
    // Anthropic might use different field names, customize as needed
    if (!response?.usage) {
        return null;
    }
    
    const usage = response.usage;
    return {
        promptTokens: usage.input_tokens || 0,
        completionTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
    };
}

/**
 * Google-specific token usage extraction
 * Google may have different response format
 */
export function extractGoogleTokenUsage(response: any): TokenUsage | null {
    // Google might use different field names, customize as needed
    if (!response?.usageMetadata) {
        return null;
    }

    const usage = response.usageMetadata;
    const result: TokenUsage = {
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0
    };

    // Extract cache hit tokens if available
    if (usage.cachedContentTokenCount !== undefined) {
        result.cacheHitTokens = usage.cachedContentTokenCount;
    }

    return result;
}

/**
 * Mistral-specific token usage extraction
 * Mistral SDK uses camelCase (promptTokens, completionTokens, totalTokens)
 * and reasoning tokens may be in additionalProperties for Magistral models
 */
export function extractMistralTokenUsage(response: any): TokenUsage | null {
    const usage = response?.usage;
    if (!usage) {
        return null;
    }

    // Mistral SDK uses camelCase field names
    const result: TokenUsage = {
        promptTokens: usage.promptTokens || 0,
        completionTokens: usage.completionTokens || 0,
        totalTokens: usage.totalTokens || 0
    };

    // Extract reasoning tokens from additionalProperties if available (Magistral models)
    // Magistral models may include reasoning token info in the additionalProperties field
    if (usage.additionalProperties) {
        const additionalProps = usage.additionalProperties;

        // Check common field names for reasoning tokens
        if (additionalProps.reasoning_tokens !== undefined) {
            result.reasoningTokens = additionalProps.reasoning_tokens;
        } else if (additionalProps.reasoningTokens !== undefined) {
            result.reasoningTokens = additionalProps.reasoningTokens;
        } else if (additionalProps.thinking_tokens !== undefined) {
            result.reasoningTokens = additionalProps.thinking_tokens;
        }
    }

    return result;
}
