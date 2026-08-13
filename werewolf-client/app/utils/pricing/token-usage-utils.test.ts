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
import { LLM_CONSTANTS, MODEL_PRICING, SupportedAiModels } from '../../ai/ai-models';

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
            const pricing = MODEL_PRICING['deepseek-v4-flash'];
            const cost = calculateCost('deepseek-v4-flash', 1_000_000, 500_000);

            const expectedCost =
                (1_000_000 * pricing.inputPrice) / 1_000_000 +
                (500_000 * pricing.outputPrice) / 1_000_000;

            expect(cost).toBeCloseTo(expectedCost, 5);
        });

        it('should calculate cost with cache hits', () => {
            const pricing = MODEL_PRICING['deepseek-v4-flash'];
            const cost = calculateCost('deepseek-v4-flash', 1_000_000, 500_000, { cacheHitTokens: 500_000 });

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

        describe('peak-valley pricing', () => {
            // DeepSeek carries live peakPricing (since 2026-08-16), but exercise the mechanism
            // through a temporary entry so these tests don't track its real rates.
            const TEST_MODEL = 'test-peak-model';

            beforeAll(() => {
                MODEL_PRICING[TEST_MODEL] = {
                    inputPrice: 1.0,
                    outputPrice: 2.0,
                    cacheHitPrice: 0.1,
                    peakPricing: { multiplier: 2, windowsUtc: [[1, 4], [6, 10]] }
                };
            });

            afterAll(() => {
                delete MODEL_PRICING[TEST_MODEL];
            });

            const at = (hour: number, minute = 0) => Date.UTC(2026, 7, 1, hour, minute);

            it('doubles all billing items inside a peak window', () => {
                const cost = calculateCost(TEST_MODEL, 1_000_000, 500_000, {
                    cacheHitTokens: 500_000,
                    timestamp: at(2, 30)
                });
                // 500k uncached @ $2 + 500k cached @ $0.20 + 500k output @ $4
                expect(cost).toBeCloseTo(1.0 + 0.1 + 2.0, 5);
            });

            it('charges regular prices outside peak windows', () => {
                const cost = calculateCost(TEST_MODEL, 1_000_000, 500_000, {
                    cacheHitTokens: 500_000,
                    timestamp: at(5, 0)
                });
                expect(cost).toBeCloseTo(0.5 + 0.05 + 1.0, 5);
            });

            it('treats windows as [start, end): start hour is peak, end hour is not', () => {
                const offPeak = calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(5) });
                expect(calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(1) })).toBeCloseTo(offPeak * 2, 5);
                expect(calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(3, 59) })).toBeCloseTo(offPeak * 2, 5);
                expect(calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(4) })).toBeCloseTo(offPeak, 5);
                expect(calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(6) })).toBeCloseTo(offPeak * 2, 5);
                expect(calculateCost(TEST_MODEL, 1_000_000, 0, { timestamp: at(10) })).toBeCloseTo(offPeak, 5);
            });

            it('defaults to the current time when no timestamp is given', () => {
                const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(at(7));
                const cost = calculateCost(TEST_MODEL, 1_000_000, 0);
                nowSpy.mockRestore();
                expect(cost).toBeCloseTo(2.0, 5);
            });

            it('ignores peak windows for models without peakPricing', () => {
                const pricing = MODEL_PRICING['glm-5.2'];
                expect(pricing.peakPricing).toBeUndefined();
                const peak = calculateCost('glm-5.2', 1_000_000, 0, { timestamp: at(2) });
                expect(peak).toBeCloseTo(pricing.inputPrice, 5);
            });
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

            const result = extractUsageAndCalculateCost('deepseek-v4-flash', mockResponse);
            
            expect(result).not.toBeNull();
            expect(result!.usage).toEqual({
                promptTokens: 1000000,
                completionTokens: 500000,
                totalTokens: 1500000,
                cacheHitTokens: 200000
            });
            
            const pricing = MODEL_PRICING['deepseek-v4-flash'];
            // Verify cost calculation: 800K uncached + 200K cached + 500K output
            const expectedCost =
                (800_000 * pricing.inputPrice) / 1_000_000 +
                (200_000 * (pricing.cacheHitPrice ?? pricing.inputPrice)) / 1_000_000 +
                (500_000 * pricing.outputPrice) / 1_000_000;
            expect(result!.cost).toBeCloseTo(expectedCost, 5);
        });

        it('should return null for invalid responses', () => {
            expect(extractUsageAndCalculateCost('deepseek-v4-flash', null)).toBeNull();
            expect(extractUsageAndCalculateCost('deepseek-v4-flash', {})).toBeNull();
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
                const mistralResponse = {
                    usage: {
                        promptTokens: 100,
                        completionTokens: 50,
                        totalTokens: 150
                    }
                };
                const result = extractMistralTokenUsage(mistralResponse);
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
                SupportedAiModels[LLM_CONSTANTS.GPT_5_6_TERRA].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.GPT_5_6_LUNA].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_PRO].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.KIMI].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_OPUS].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_SONNET].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.GEMINI_3_PRO].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.GEMINI_3_FLASH].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_LARGE].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.MISTRAL_3_5_MEDIUM].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.MISTRAL_4_SMALL].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.MISTRAL_MAGISTRAL].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.GROK_4_6].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.GLM].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.QWEN_MAX].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.QWEN_PLUS].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.QWEN_FLASH].modelApiName,
                SupportedAiModels[LLM_CONSTANTS.MINIMAX].modelApiName,
            ];

            expectedModels.forEach(model => {
                expect(MODEL_PRICING[model]).toBeDefined();
                expect(typeof MODEL_PRICING[model].inputPrice).toBe('number');
                expect(typeof MODEL_PRICING[model].outputPrice).toBe('number');
            });
        });
    });

    // Cache-hit wire shapes verified against live provider docs/APIs 2026-08-04.
    describe('cache-hit extraction wire shapes', () => {
        it('reads Kimi top-level usage.cached_tokens (third wire shape)', () => {
            const usage = extractKimiTokenUsage({
                usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, cached_tokens: 800 }
            });
            expect(usage?.cacheHitTokens).toBe(800);
        });

        it('prefers DeepSeek prompt_cache_hit_tokens and nested cached_tokens over Kimi shape', () => {
            const deepseek = extractTokenUsage({
                usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, prompt_cache_hit_tokens: 700, prompt_cache_miss_tokens: 300 }
            });
            expect(deepseek?.cacheHitTokens).toBe(700);
            expect(deepseek?.cacheMissTokens).toBe(300);

            const nested = extractTokenUsage({
                usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, prompt_tokens_details: { cached_tokens: 600 } }
            });
            expect(nested?.cacheHitTokens).toBe(600);
        });

        it('reads Mistral cache hits from usage.additionalProperties (observed live: prompt_tokens_details.cached_tokens)', () => {
            const usage = extractMistralTokenUsage({
                usage: {
                    promptTokens: 2950,
                    completionTokens: 86,
                    totalTokens: 3036,
                    additionalProperties: { prompt_tokens_details: { cached_tokens: 2933 }, service_tier: 'standard' }
                }
            });
            expect(usage?.cacheHitTokens).toBe(2933);
        });

        it('leaves cacheHitTokens unset when Mistral reports no cache fields', () => {
            const usage = extractMistralTokenUsage({
                usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, additionalProperties: { service_tier: 'standard' } }
            });
            expect(usage?.cacheHitTokens).toBeUndefined();
        });

        it('bills cached tokens at the cached rate end to end (grok-4.6 at $0.50/M cached)', () => {
            // Stay under the 200K extended-context threshold to test the base tier:
            // 50K uncached * $2 + 50K cached * $0.50 + 100K out * $6, per million.
            const cost = calculateCost('grok-4.6', 100_000, 100_000, { cacheHitTokens: 50_000 });
            expect(cost).toBeCloseTo(0.725, 4);
        });

        it('doubles all grok-4.6 rates once the prompt reaches 200K tokens', () => {
            // 0.5M uncached * $4 + 0.5M cached * $1 + 1M out * $12 (>=200K prompt tier)
            const cost = calculateCost('grok-4.6', 1_000_000, 1_000_000, { cacheHitTokens: 500_000 });
            expect(cost).toBeCloseTo(14.5, 2);
        });
    });
});
