import {
    extractTokenUsageFromResponse,
    calculateDeepSeekCost
} from './deepseek-pricing';
import { MODEL_PRICING } from '../../ai/ai-models';

describe('DeepSeek Pricing Utils', () => {
    describe('extractTokenUsageFromResponse', () => {
        it('should extract basic token usage from response', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);

            expect(result).toEqual({
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150
            });
        });

        it('should extract token usage with cache information', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 200,
                    completion_tokens: 75,
                    total_tokens: 275,
                    prompt_cache_hit_tokens: 50,
                    prompt_cache_miss_tokens: 150
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);

            expect(result).toEqual({
                promptTokens: 200,
                completionTokens: 75,
                totalTokens: 275,
                cacheHitTokens: 50,
                cacheMissTokens: 150
            });
        });

        it('should extract token usage with reasoning tokens', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 150,
                    total_tokens: 250,
                    completion_tokens_details: {
                        reasoning_tokens: 80
                    }
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);

            expect(result).toEqual({
                promptTokens: 100,
                completionTokens: 150,
                totalTokens: 250,
                reasoningTokens: 80
            });
        });

        it('should return null for invalid response', () => {
            expect(extractTokenUsageFromResponse(null)).toBeNull();
            expect(extractTokenUsageFromResponse({})).toBeNull();
            expect(extractTokenUsageFromResponse({ data: 'no usage' })).toBeNull();
        });

        it('should handle missing optional fields gracefully', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);

            expect(result).toEqual({
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            });
        });
    });

    describe('calculateDeepSeekCost', () => {
        it('should calculate cost for deepseek-v4-flash model', () => {
            // deepseek-v4-flash: $0.14/M input, $0.28/M output
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 1000000, 500000);

            // 1M input tokens * $0.14/M + 0.5M output tokens * $0.28/M
            expect(cost).toBeCloseTo(0.14 + 0.14, 5);
        });

        it('should calculate cost for deepseek-v4-pro model', () => {
            // deepseek-v4-pro: $0.435/M input, $0.87/M output
            const cost = calculateDeepSeekCost('deepseek-v4-pro', 1000000, 1000000);

            // 1M input tokens * $0.435/M + 1M output tokens * $0.87/M
            expect(cost).toBeCloseTo(0.435 + 0.87, 5);
        });

        it('should calculate cost with cache hits for deepseek-v4-flash', () => {
            // 1M total input, 500K cached
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 1000000, 500000, 500000);

            // 500K uncached * $0.14/M + 500K cached * $0.0028/M + 500K output * $0.28/M
            const expectedCost = (500000 * 0.14 / 1000000) + (500000 * 0.0028 / 1000000) + (500000 * 0.28 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should handle unknown model gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const cost = calculateDeepSeekCost('unknown-model', 1000, 500);

            // Should return 0 for unknown model
            expect(cost).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pricing information available'));

            consoleSpy.mockRestore();
        });

        it('should handle zero tokens', () => {
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 0, 0);
            expect(cost).toBe(0);
        });

        it('should handle cache hits exceeding input tokens', () => {
            // Edge case: more cache hits than input tokens (shouldn't happen but handle gracefully)
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 100000, 50000, 150000);

            // When cache hits exceed input, only the actual input amount should be considered cached
            // So 100K input tokens are all cached (capped at input amount)
            const expectedCost = (100000 * 0.0028 / 1000000) + (50000 * 0.28 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for DeepSeek V4 models', () => {
            expect(MODEL_PRICING['deepseek-v4-flash']).toBeDefined();
            expect(MODEL_PRICING['deepseek-v4-flash'].inputPrice).toBe(0.14);
            expect(MODEL_PRICING['deepseek-v4-flash'].outputPrice).toBe(0.28);
            expect(MODEL_PRICING['deepseek-v4-flash'].cacheHitPrice).toBe(0.0028);

            expect(MODEL_PRICING['deepseek-v4-pro']).toBeDefined();
            expect(MODEL_PRICING['deepseek-v4-pro'].inputPrice).toBe(0.435);
            expect(MODEL_PRICING['deepseek-v4-pro'].outputPrice).toBe(0.87);
            expect(MODEL_PRICING['deepseek-v4-pro'].cacheHitPrice).toBe(0.003625);
        });
    });
});
