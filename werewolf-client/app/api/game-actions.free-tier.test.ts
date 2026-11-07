import {LLM_CONSTANTS} from '@/app/ai/ai-models';
import {
    getCandidateModelsForTier,
    validateModelUsageForTier
} from '@/app/ai/model-limit-utils';

describe('free tier model limits', () => {
    it('allows unlimited models to be reused by bots', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_FLASH, [LLM_CONSTANTS.DEEPSEEK_FLASH, LLM_CONSTANTS.DEEPSEEK_FLASH])
        ).not.toThrow();
    });

    it('prevents using single-use models more than once per game', () => {
        // Gemini 4 Argon: measured in the 1-bot band.
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_ARGON, [LLM_CONSTANTS.GEMINI_ARGON])
        ).toThrow('can only be used once');
    });

    it('enforces the three-use limit for DeepSeek Pro', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_PRO, [
                LLM_CONSTANTS.DEEPSEEK_PRO,
                LLM_CONSTANTS.DEEPSEEK_PRO,
            ])
        ).not.toThrow();

        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_PRO, [
                LLM_CONSTANTS.DEEPSEEK_PRO,
                LLM_CONSTANTS.DEEPSEEK_PRO,
                LLM_CONSTANTS.DEEPSEEK_PRO,
            ])
        ).toThrow('can only be used 3 times');
    });

    it('enforces the single-use limit for Gemini 4 Argon (measured in the 1-bot band)', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_ARGON, [])
        ).not.toThrow();

        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_ARGON, [
                LLM_CONSTANTS.GEMINI_ARGON,
            ])
        ).toThrow('can only be used once');
    });

    it('rejects models that are unavailable on the free tier', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_OPUS, [])
        ).toThrow('not available on the free tier');

        // Gemini Pro is paid-only on 667 measured turns (2.8¢, past the 2¢ ceiling).
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_PRO, [])
        ).toThrow('not available on the free tier');
    });

    it('keeps Sonnet 5.5 on the paid tier only, by decision (2026-11-02), though its measured turn is in the 1-bot band', () => {
        expect(() => validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_SONNET, [])).toThrow();
        expect(getCandidateModelsForTier('free')).not.toContain(LLM_CONSTANTS.CLAUDE_SONNET);
        expect(() => validateModelUsageForTier('paid', LLM_CONSTANTS.CLAUDE_SONNET, [LLM_CONSTANTS.CLAUDE_SONNET])).not.toThrow();
    });

    it('seats Gemini 4 Argon once per free game on its measured band', () => {
        expect(() => validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_ARGON, [])).not.toThrow();
        expect(() => validateModelUsageForTier('free', LLM_CONSTANTS.GEMINI_ARGON, [LLM_CONSTANTS.GEMINI_ARGON])).toThrow();
    });

    it('allows paid tier users to reuse any models without per-game caps', () => {
        expect(() =>
            validateModelUsageForTier('paid', LLM_CONSTANTS.CLAUDE_OPUS, Array(3).fill(LLM_CONSTANTS.CLAUDE_OPUS))
        ).not.toThrow();
    });

    it('lists only free-tier-accessible models for random selection', () => {
        const candidates = getCandidateModelsForTier('free');
        expect(candidates).toContain(LLM_CONSTANTS.CLAUDE_HAIKU);
        expect(candidates).toContain(LLM_CONSTANTS.DEEPSEEK_PRO);
        expect(candidates).not.toContain(LLM_CONSTANTS.GEMINI_PRO);
        expect(candidates).not.toContain(LLM_CONSTANTS.CLAUDE_OPUS);
    });
});
