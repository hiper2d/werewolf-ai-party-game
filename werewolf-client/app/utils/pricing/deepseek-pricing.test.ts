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

        it('should extract token usage with reasoning tokens (deepseek-reasoner)', () => {
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
        it('should calculate cost for deepseek-chat model', () => {
            // deepseek-chat: $0.56/M input, $1.68/M output
            const cost = calculateDeepSeekCost('deepseek-chat', 1000000, 500000);
            
            // 1M input tokens * $0.56/M + 0.5M output tokens * $1.68/M
            expect(cost).toBeCloseTo(0.56 + 0.84, 5);
        });

        it('should calculate cost for deepseek-reasoner model', () => {
            // deepseek-reasoner: $0.56/M input, $1.68/M output (same as chat)
            const cost = calculateDeepSeekCost('deepseek-reasoner', 1000000, 1000000);
            
            // 1M input tokens * $0.56/M + 1M output tokens * $1.68/M
            expect(cost).toBeCloseTo(0.56 + 1.68, 5);
        });

        it('should calculate cost with cache hits for deepseek-chat', () => {
            // 1M total input, 500K cached
            const cost = calculateDeepSeekCost('deepseek-chat', 1000000, 500000, 500000);
            
            // 500K uncached * $0.56/M + 500K cached * $0.07/M + 500K output * $1.68/M
            const expectedCost = (500000 * 0.56 / 1000000) + (500000 * 0.07 / 1000000) + (500000 * 1.68 / 1000000);
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
            const cost = calculateDeepSeekCost('deepseek-chat', 0, 0);
            expect(cost).toBe(0);
        });

        it('should handle cache hits exceeding input tokens', () => {
            // Edge case: more cache hits than input tokens (shouldn't happen but handle gracefully)
            const cost = calculateDeepSeekCost('deepseek-chat', 100000, 50000, 150000);
            
            // When cache hits exceed input, only the actual input amount should be considered cached
            // So 100K input tokens are all cached (capped at input amount)
            const expectedCost = (100000 * 0.07 / 1000000) + (50000 * 1.68 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for DeepSeek models', () => {
            expect(MODEL_PRICING['deepseek-chat']).toBeDefined();
            expect(MODEL_PRICING['deepseek-chat'].inputPrice).toBe(0.56);
            expect(MODEL_PRICING['deepseek-chat'].outputPrice).toBe(1.68);
            expect(MODEL_PRICING['deepseek-chat'].cacheHitPrice).toBe(0.07);

            expect(MODEL_PRICING['deepseek-reasoner']).toBeDefined();
            expect(MODEL_PRICING['deepseek-reasoner'].inputPrice).toBe(0.56);
            expect(MODEL_PRICING['deepseek-reasoner'].outputPrice).toBe(1.68);
            expect(MODEL_PRICING['deepseek-reasoner'].cacheHitPrice).toBe(0.07);
        });
    });
});