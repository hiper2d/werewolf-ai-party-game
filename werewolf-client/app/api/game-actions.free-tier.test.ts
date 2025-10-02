import {LLM_CONSTANTS} from '@/app/ai/ai-models';
import {
    getCandidateModelsForTier,
    validateModelUsageForTier
} from '@/app/ai/model-limit-utils';

describe('free tier model limits', () => {
    it('allows unlimited models to be reused by bots', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.DEEPSEEK_CHAT, [LLM_CONSTANTS.DEEPSEEK_CHAT, LLM_CONSTANTS.DEEPSEEK_CHAT])
        ).not.toThrow();
    });

    it('prevents using single-use models more than once per game', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_SONNET, [LLM_CONSTANTS.CLAUDE_4_SONNET])
        ).toThrow('can only be used once');
    });

    it('rejects models that are unavailable on the free tier', () => {
        expect(() =>
            validateModelUsageForTier('free', LLM_CONSTANTS.CLAUDE_4_OPUS, [])
        ).toThrow('not available on the free tier');
    });

    it('allows API tier users to reuse any models without restriction', () => {
        expect(() =>
            validateModelUsageForTier('api', LLM_CONSTANTS.CLAUDE_4_OPUS, Array(3).fill(LLM_CONSTANTS.CLAUDE_4_OPUS))
        ).not.toThrow();
    });

    it('lists only free-tier-accessible models for random selection', () => {
        const candidates = getCandidateModelsForTier('free');
        expect(candidates).toContain(LLM_CONSTANTS.CLAUDE_4_SONNET);
        expect(candidates).not.toContain(LLM_CONSTANTS.CLAUDE_4_OPUS);
    });
});
