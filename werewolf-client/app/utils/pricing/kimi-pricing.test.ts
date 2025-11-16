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
        it('should calculate cost for kimi-k2-0905-preview model', () => {
            // kimi-k2-0905-preview: $0.6/M input, $2.50/M output
            const cost = calculateKimiCost('kimi-k2-0905-preview', 1000, 500);
            
            // 1K input tokens * $0.6/M + 0.5K output tokens * $2.50/M
            expect(cost).toBeCloseTo((1000 * 0.6 / 1000000) + (500 * 2.50 / 1000000), 5);
        });

        it('should handle large token counts', () => {
            const cost = calculateKimiCost('kimi-k2-0905-preview', 100000, 50000);
            
            // 100K input * $0.6/M + 50K output * $2.50/M
            expect(cost).toBeCloseTo((100000 * 0.6 / 1000000) + (50000 * 2.50 / 1000000), 5);
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
            const cost = calculateKimiCost('kimi-k2-0905-preview', 0, 0);
            expect(cost).toBe(0);
        });

        it('should calculate cost for kimi-k2-thinking model', () => {
            // kimi-k2-thinking shares pricing with kimi-k2-0905-preview per Moonshot docs
            const cost = calculateKimiCost('kimi-k2-thinking', 2500, 1000);
            const expected = (2500 * 0.6 / 1_000_000) + (1000 * 2.50 / 1_000_000);
            expect(cost).toBeCloseTo(expected, 5);
        });

        it('should calculate fractional token costs correctly', () => {
            const cost = calculateKimiCost('kimi-k2-0905-preview', 333, 777);
            
            // 333 input * $0.6/M + 777 output * $2.50/M
            const expectedCost = (333 * 0.6 / 1000000) + (777 * 2.50 / 1000000);
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should calculate cost with cache hits (when supported)', () => {
            // Note: Current Kimi agent doesn't extract cache info, but pricing supports it
            // This test shows how it would work if cache info was available
            const cost = calculateKimiCost('kimi-k2-0905-preview', 1000000, 500000);
            
            // 1M input * $0.6/M + 0.5M output * $2.50/M (no cache)
            expect(cost).toBeCloseTo(0.6 + 1.25, 5);
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for Kimi models', () => {
            expect(MODEL_PRICING['kimi-k2-0905-preview']).toBeDefined();
            expect(MODEL_PRICING['kimi-k2-0905-preview'].inputPrice).toBe(0.6);
            expect(MODEL_PRICING['kimi-k2-0905-preview'].outputPrice).toBe(2.50);
            expect(MODEL_PRICING['kimi-k2-0905-preview'].cacheHitPrice).toBe(0.15);

            expect(MODEL_PRICING['kimi-k2-thinking']).toBeDefined();
            expect(MODEL_PRICING['kimi-k2-thinking'].inputPrice).toBe(0.6);
            expect(MODEL_PRICING['kimi-k2-thinking'].outputPrice).toBe(2.50);
            expect(MODEL_PRICING['kimi-k2-thinking'].cacheHitPrice).toBe(0.15);
        });
    });
});
