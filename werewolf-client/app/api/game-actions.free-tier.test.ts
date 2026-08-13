import {LLM_CONSTANTS} from '@/app/ai/ai-models';
import {
    getCandidateModelsForTier,
    validateModelUsageForTier
} from '@/app/ai/model-limit-utils';

describe('free tier model limits', () => {
    it('allows unlimited models to be reused by bots', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_V4_FLASH, [LLM_CONSTANTS.DEEPSEEK_V4_FLASH, LLM_CONSTANTS.DEEPSEEK_V4_FLASH])
        ).not.toThrow();
    });

    it('prevents using single-use models more than once per game', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GLM, [LLM_CONSTANTS.GLM])
        ).toThrow('can only be used once');
    });

    it('enforces the three-use limit for DeepSeek Pro', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_V4_PRO, [
                LLM_CONSTANTS.DEEPSEEK_V4_PRO,
                LLM_CONSTANTS.DEEPSEEK_V4_PRO,
            ])
        ).not.toThrow();

        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_V4_PRO, [
                LLM_CONSTANTS.DEEPSEEK_V4_PRO,
                LLM_CONSTANTS.DEEPSEEK_V4_PRO,
                LLM_CONSTANTS.DEEPSEEK_V4_PRO,
            ])
        ).toThrow('can only be used 3 times');
    });

    it('enforces the single-use limit for Claude Haiku (thinking cost lands it in the 1-bot band)', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_HAIKU, [])
        ).not.toThrow();

        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_HAIKU, [
                LLM_CONSTANTS.CLAUDE_4_HAIKU,
            ])
        ).toThrow('can only be used once');
    });

    it('rejects models that are unavailable on the free tier', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_OPUS, [])
        ).toThrow('not available on the free tier');

        // Sonnet's $15 sticker output ×2.5 thinking factor puts it past the free-tier ceiling.
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_SONNET, [])
        ).toThrow('not available on the free tier');
    });

    it('allows paid tier users to reuse any models without per-game caps', () => {
        expect(() =>
            validateModelUsageForTier('paid', LLM_CONSTANTS.CLAUDE_4_OPUS, Array(3).fill(LLM_CONSTANTS.CLAUDE_4_OPUS))
        ).not.toThrow();
    });

    it('lists only free-tier-accessible models for random selection', () => {
        const candidates = getCandidateModelsForTier('free');
        expect(candidates).toContain(LLM_CONSTANTS.CLAUDE_4_HAIKU);
        expect(candidates).toContain(LLM_CONSTANTS.DEEPSEEK_V4_PRO);
        expect(candidates).not.toContain(LLM_CONSTANTS.CLAUDE_4_SONNET);
        expect(candidates).not.toContain(LLM_CONSTANTS.CLAUDE_4_OPUS);
    });
});
