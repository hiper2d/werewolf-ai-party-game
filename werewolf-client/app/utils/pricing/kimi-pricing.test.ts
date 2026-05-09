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
        it('should calculate cost for kimi-k2.6 model', () => {
            // kimi-k2.6: $0.95/M input, $4.00/M output
            const cost = calculateKimiCost('kimi-k2.6', 1000, 500);

            // 1K input tokens * $0.95/M + 0.5K output tokens * $4.00/M
            expect(cost).toBeCloseTo((1000 * 0.95 / 1000000) + (500 * 4.00 / 1000000), 5);
        });

        it('should handle large token counts', () => {
            const cost = calculateKimiCost('kimi-k2.6', 100000, 50000);

            // 100K input * $0.95/M + 50K output * $4.00/M
            expect(cost).toBeCloseTo((100000 * 0.95 / 1000000) + (50000 * 4.00 / 1000000), 5);
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
            const cost = calculateKimiCost('kimi-k2.6', 0, 0);
            expect(cost).toBe(0);
        });

        it('should calculate fractional token costs correctly', () => {
            const cost = calculateKimiCost('kimi-k2.6', 333, 777);

            // 333 input * $0.95/M + 777 output * $4.00/M
            const expectedCost = (333 * 0.95 / 1000000) + (777 * 4.00 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should calculate cost with cache hits (when supported)', () => {
            // Note: Current Kimi agent doesn't extract cache info, but pricing supports it
            const cost = calculateKimiCost('kimi-k2.6', 1000000, 500000);

            // 1M input * $0.95/M + 0.5M output * $4.00/M (no cache)
            expect(cost).toBeCloseTo(0.95 + 2.0, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for Kimi models', () => {
            expect(MODEL_PRICING['kimi-k2.6']).toBeDefined();
            expect(MODEL_PRICING['kimi-k2.6'].inputPrice).toBe(0.95);
            expect(MODEL_PRICING['kimi-k2.6'].outputPrice).toBe(4.00);
            expect(MODEL_PRICING['kimi-k2.6'].cacheHitPrice).toBe(0.16);
        });
    });
});
