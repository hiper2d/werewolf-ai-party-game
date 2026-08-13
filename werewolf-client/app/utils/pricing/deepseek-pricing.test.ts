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
        // DeepSeek bills 2x during peak windows (UTC 1:00-4:00 and 6:00-10:00) and
        // calculateDeepSeekCost stamps the current time, so pin the clock to an off-peak
        // hour or these tests would double their expectations when CI runs in a peak window.
        const OFF_PEAK_UTC = new Date('2026-08-20T12:00:00Z').getTime();
        const PEAK_UTC = new Date('2026-08-20T02:00:00Z').getTime();

        beforeEach(() => {
            jest.spyOn(Date, 'now').mockReturnValue(OFF_PEAK_UTC);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should calculate cost for deepseek-v4-flash model', () => {
            // deepseek-v4-flash off-peak: $0.22/M input, $0.66/M output
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 1000000, 500000);

            // 1M input tokens * $0.22/M + 0.5M output tokens * $0.66/M
            expect(cost).toBeCloseTo(0.22 + 0.33, 5);
        });

        it('should calculate cost for deepseek-v4-pro model', () => {
            // deepseek-v4-pro off-peak: $0.66/M input, $1.98/M output
            const cost = calculateDeepSeekCost('deepseek-v4-pro', 1000000, 1000000);

            // 1M input tokens * $0.66/M + 1M output tokens * $1.98/M
            expect(cost).toBeCloseTo(0.66 + 1.98, 5);
        });

        it('should calculate cost with cache hits for deepseek-v4-flash', () => {
            // 1M total input, 500K cached
            const cost = calculateDeepSeekCost('deepseek-v4-flash', 1000000, 500000, 500000);

            // 500K uncached * $0.22/M + 500K cached * $0.007/M + 500K output * $0.66/M
            const expectedCost = (500000 * 0.22 / 1000000) + (500000 * 0.007 / 1000000) + (500000 * 0.66 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should double all billing items during a peak window', () => {
            jest.spyOn(Date, 'now').mockReturnValue(PEAK_UTC);

            const cost = calculateDeepSeekCost('deepseek-v4-flash', 1000000, 500000, 500000);

            const offPeakCost = (500000 * 0.22 / 1000000) + (500000 * 0.007 / 1000000) + (500000 * 0.66 / 1000000);
            expect(cost).toBeCloseTo(offPeakCost * 2, 5);
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
            const expectedCost = (100000 * 0.007 / 1000000) + (50000 * 0.66 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for DeepSeek V4 models', () => {
            expect(MODEL_PRICING['deepseek-v4-flash']).toBeDefined();
            expect(MODEL_PRICING['deepseek-v4-flash'].inputPrice).toBe(0.22);
            expect(MODEL_PRICING['deepseek-v4-flash'].outputPrice).toBe(0.66);
            expect(MODEL_PRICING['deepseek-v4-flash'].cacheHitPrice).toBe(0.007);

            expect(MODEL_PRICING['deepseek-v4-pro']).toBeDefined();
            expect(MODEL_PRICING['deepseek-v4-pro'].inputPrice).toBe(0.66);
            expect(MODEL_PRICING['deepseek-v4-pro'].outputPrice).toBe(1.98);
            expect(MODEL_PRICING['deepseek-v4-pro'].cacheHitPrice).toBe(0.022);
        });

        it('should carry the peak-valley schedule on both DeepSeek models', () => {
            for (const model of ['deepseek-v4-flash', 'deepseek-v4-pro']) {
                expect(MODEL_PRICING[model].peakPricing).toEqual({
                    multiplier: 2,
                    windowsUtc: [[1, 4], [6, 10]]
                });
            }
        });
    });
});
