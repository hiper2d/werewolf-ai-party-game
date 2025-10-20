import { 
    extractTokenUsage, 
    calculateCost,
    extractUsageAndCalculateCost,
    extractDeepSeekTokenUsage,
    extractOpenAITokenUsage,
    extractKimiTokenUsage,
    extractGrokTokenUsage,
    extractAnthropicTokenUsage,
    extractGoogleTokenUsage,
    extractMistralTokenUsage
} from './token-usage-utils';
import { MODEL_PRICING } from '../../ai/ai-models';

describe('Token Usage Utils', () => {
    describe('extractTokenUsage', () => {
        it('should extract basic OpenAI-compatible token usage', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150
                }
            };

            const result = extractTokenUsage(mockResponse);
            
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

            const result = extractTokenUsage(mockResponse);
            
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

            const result = extractTokenUsage(mockResponse);
            
            expect(result).toEqual({
                promptTokens: 100,
                completionTokens: 150,
                totalTokens: 250,
                reasoningTokens: 80
            });
        });

        it('should return null for invalid response', () => {
            expect(extractTokenUsage(null)).toBeNull();
            expect(extractTokenUsage({})).toBeNull();
            expect(extractTokenUsage({ data: 'no usage' })).toBeNull();
        });
    });

    describe('calculateCost', () => {
        it('should calculate cost for known models', () => {
            const pricing = MODEL_PRICING['deepseek-chat'];
            const cost = calculateCost('deepseek-chat', 1_000_000, 500_000);

            const expectedCost =
                (1_000_000 * pricing.inputPrice) / 1_000_000 +
                (500_000 * pricing.outputPrice) / 1_000_000;

            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should calculate cost with cache hits', () => {
            const pricing = MODEL_PRICING['deepseek-chat'];
            const cost = calculateCost('deepseek-chat', 1_000_000, 500_000, { cacheHitTokens: 500_000 });

            const expectedCost =
                (500_000 * pricing.inputPrice) / 1_000_000 +
                (500_000 * (pricing.cacheHitPrice ?? pricing.inputPrice)) / 1_000_000 +
                (500_000 * pricing.outputPrice) / 1_000_000;
            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should return 0 for unknown models', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            const cost = calculateCost('unknown-model', 1000, 500);
            
            expect(cost).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pricing information available'));
            
            consoleSpy.mockRestore();
        });
    });

    describe('extractUsageAndCalculateCost', () => {
        it('should extract usage and calculate cost in one operation', () => {
            const mockResponse = {
                usage: {
                    prompt_tokens: 1000000,
                    completion_tokens: 500000,
                    total_tokens: 1500000,
                    prompt_cache_hit_tokens: 200000
                }
            };

            const result = extractUsageAndCalculateCost('deepseek-chat', mockResponse);
            
            expect(result).not.toBeNull();
            expect(result!.usage).toEqual({
                promptTokens: 1000000,
                completionTokens: 500000,
                totalTokens: 1500000,
                cacheHitTokens: 200000
            });
            
            const pricing = MODEL_PRICING['deepseek-chat'];
            // Verify cost calculation: 800K uncached + 200K cached + 500K output
            const expectedCost =
                (800_000 * pricing.inputPrice) / 1_000_000 +
                (200_000 * (pricing.cacheHitPrice ?? pricing.inputPrice)) / 1_000_000 +
                (500_000 * pricing.outputPrice) / 1_000_000;
            expect(result!.cost).toBeCloseTo(expectedCost, 5);
        });

        it('should return null for invalid responses', () => {
            expect(extractUsageAndCalculateCost('deepseek-chat', null)).toBeNull();
            expect(extractUsageAndCalculateCost('deepseek-chat', {})).toBeNull();
        });
    });

    describe('provider-specific extractors', () => {
        describe('extractAnthropicTokenUsage', () => {
            it('should handle Anthropic response format', () => {
                const mockResponse = {
                    usage: {
                        input_tokens: 100,
                        output_tokens: 50
                    }
                };

                const result = extractAnthropicTokenUsage(mockResponse);
                
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should return null for invalid Anthropic response', () => {
                expect(extractAnthropicTokenUsage({})).toBeNull();
                expect(extractAnthropicTokenUsage(null)).toBeNull();
            });
        });

        describe('extractGoogleTokenUsage', () => {
            it('should handle Google response format', () => {
                const mockResponse = {
                    usageMetadata: {
                        promptTokenCount: 100,
                        candidatesTokenCount: 50,
                        totalTokenCount: 150
                    }
                };

                const result = extractGoogleTokenUsage(mockResponse);
                
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should return null for invalid Google response', () => {
                expect(extractGoogleTokenUsage({})).toBeNull();
                expect(extractGoogleTokenUsage(null)).toBeNull();
            });
        });

        describe('OpenAI-compatible extractors', () => {
            const openAIFormatResponse = {
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150
                }
            };

            it('should handle DeepSeek format', () => {
                const result = extractDeepSeekTokenUsage(openAIFormatResponse);
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should handle OpenAI format', () => {
                const result = extractOpenAITokenUsage(openAIFormatResponse);
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should handle Kimi format', () => {
                const result = extractKimiTokenUsage(openAIFormatResponse);
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should handle Grok format', () => {
                const result = extractGrokTokenUsage(openAIFormatResponse);
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });

            it('should handle Mistral format', () => {
                const result = extractMistralTokenUsage(openAIFormatResponse);
                expect(result).toEqual({
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150
                });
            });
        });
    });

    describe('MODEL_PRICING integration', () => {
        it('should have pricing for all supported models', () => {
            const expectedModels = [
                'gpt-5', 'gpt-5-mini',
                'deepseek-chat', 'deepseek-reasoner',
                'kimi-k2-0905-preview',
                'claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5',
                'gemini-2.5-pro',
                'mistral-large-latest', 'mistral-medium-latest', 'magistral-medium-latest',
                'grok-4'
            ];

            expectedModels.forEach(model => {
                expect(MODEL_PRICING[model]).toBeDefined();
                expect(typeof MODEL_PRICING[model].inputPrice).toBe('number');
                expect(typeof MODEL_PRICING[model].outputPrice).toBe('number');
            });
        });
    });
});
