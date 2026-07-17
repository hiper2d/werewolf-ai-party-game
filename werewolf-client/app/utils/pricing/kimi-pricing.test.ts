import { 
    extractTokenUsageFromResponse, 
    calculateKimiCost
} from './kimi-pricing';
import { MODEL_PRICING } from '../../ai/ai-models';

describe('Kimi Pricing Utils', () => {
    describe('extractTokenUsageFromResponse', () => {
        it('should extract token usage from OpenAI-compatible response', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 150,
                    completion_tokens: 75,
                    total_tokens: 225
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);
            
            expect(result).toEqual({
                promptTokens: 150,
                completionTokens: 75,
                totalTokens: 225
            });
        });

        it('should handle missing optional fields gracefully', () => {
            const mockResponse = {
                usage: {}
            };

            const result = extractTokenUsageFromResponse(mockResponse);
            
            expect(result).toEqual({
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            });
        });

        it('should return null for invalid response', () => {
            expect(extractTokenUsageFromResponse(null)).toBeNull();
            expect(extractTokenUsageFromResponse({})).toBeNull();
            expect(extractTokenUsageFromResponse({ data: 'no usage' })).toBeNull();
        });

        it('should handle partial usage data', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 100,
                    total_tokens: 150
                    // completion_tokens missing
                }
            };

            const result = extractTokenUsageFromResponse(mockResponse);
            
            expect(result).toEqual({
                promptTokens: 100,
                completionTokens: 0,
                totalTokens: 150
            });
        });
    });

    describe('calculateKimiCost', () => {
        it('should calculate cost for kimi-k3 model', () => {
            // kimi-k3: $3.00/M input, $15.00/M output
            const cost = calculateKimiCost('kimi-k3', 1000, 500);

            // 1K input tokens * $3.00/M + 0.5K output tokens * $15.00/M
            expect(cost).toBeCloseTo((1000 * 3.00 / 1000000) + (500 * 15.00 / 1000000), 5);
        });

        it('should handle large token counts', () => {
            const cost = calculateKimiCost('kimi-k3', 100000, 50000);

            // 100K input * $3.00/M + 50K output * $15.00/M
            expect(cost).toBeCloseTo((100000 * 3.00 / 1000000) + (50000 * 15.00 / 1000000), 5);
        });

        it('should handle unknown model gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const cost = calculateKimiCost('unknown-model', 1000, 500);

            // Should return 0 for unknown model
            expect(cost).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pricing information available'));

            consoleSpy.mockRestore();
        });

        it('should handle zero tokens', () => {
            const cost = calculateKimiCost('kimi-k3', 0, 0);
            expect(cost).toBe(0);
        });

        it('should calculate fractional token costs correctly', () => {
            const cost = calculateKimiCost('kimi-k3', 333, 777);

            // 333 input * $3.00/M + 777 output * $15.00/M
            const expectedCost = (333 * 3.00 / 1000000) + (777 * 15.00 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should calculate cost with cache hits (when supported)', () => {
            // Cache hits come from usage.prompt_tokens_details.cached_tokens; none passed here.
            const cost = calculateKimiCost('kimi-k3', 1000000, 500000);

            // 1M input * $3.00/M + 0.5M output * $15.00/M (no cache)
            expect(cost).toBeCloseTo(3.0 + 7.5, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for Kimi models', () => {
            expect(MODEL_PRICING['kimi-k3']).toBeDefined();
            expect(MODEL_PRICING['kimi-k3'].inputPrice).toBe(3.00);
            expect(MODEL_PRICING['kimi-k3'].outputPrice).toBe(15.00);
            expect(MODEL_PRICING['kimi-k3'].cacheHitPrice).toBe(0.30);
        });
    });
});
