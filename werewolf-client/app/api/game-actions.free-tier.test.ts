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
        // GPT-6.1 Terra: 1.3¢ a turn on the sticker estimate, the 1-bot band.
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GPT, [LLM_CONSTANTS.GPT])
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

    it('enforces the single-use limit for GPT-6.1 Terra (the 1.3¢ sticker estimate lands it in the 1-bot band)', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GPT, [])
        ).not.toThrow();

        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.GPT, [
                LLM_CONSTANTS.GPT,
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

    it('temporarily seats Sonnet 5.5 and Gemini 4 Argon once per free game to collect measured turns', () => {
        // Explicit freeTier opt-outs in ai-models.ts (2026-10-13); drop this test with them.
        for (const model of [LLM_CONSTANTS.CLAUDE_SONNET, LLM_CONSTANTS.GEMINI_ARGON]) {
            expect(() => validateModelUsageForTier('free', model, [])).not.toThrow();
            expect(() => validateModelUsageForTier('free', model, [model])).toThrow();
        }
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
