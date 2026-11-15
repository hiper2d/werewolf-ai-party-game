import { AgentFactory as LibAgentFactory, AbstractAgent, ClaudeAgent, setLlmLogger, setBeforeAskHook, setRetryHook } from '@hiper2d/ai-agents';
import type { ApiKeyMap } from '@hiper2d/ai-agents';
import { firestore } from 'firebase-admin';
import { db } from '@/firebase/server';
import { LLM_CONSTANTS, resolveModelId } from '@/app/ai/ai-models';
import type { LlmRetryNotice } from '@/app/api/game-models';
import { logger } from '@/app/utils/logger';
import { assertFreeSpendWithinLimit } from '@/app/api/user-actions';

/**
 * How many times one ask is re-sent after the model answered with nothing, or with text
 * that is not the JSON asked for (the library's ModelInvalidResponseError — never a
 * timeout, a refusal, a transport error or an output-cap hit, which all still surface at
 * once). One, because those are one-off generation failures the same prompt gets right
 * on the next try nearly every time (DeepSeek's empty werewolf-chat replies, a MiniMax
 * sheet batch without its `players` array), while a second failure in a row is worth
 * the player's attention. The re-send runs the free-tier spend guard again.
 */
const LLM_INVALID_RESPONSE_RETRIES = 1;

/**
 * Claude prompt caching: the 5-minute cache, ON TRIAL since 2026-11-15. A 5m write bills at
 * 1.25x input and a read at 0.1x, so it pays only when more than ~22% of the prompt is read
 * back. History: the 1h cache (2x write, ~53% break-even) read 42-43% back over 30 days of
 * production bot turns (input cost ~1.2x of no cache), and the 5m cache read 0-16% on the old
 * prompt layout (2026-09-06), so caching was 'off' from 2026-11-06 to 2026-11-15. The trial
 * asks whether the frozen system prompt and append-only history (2026-11-11/12) lift the 5m
 * read share over break-even. Judge it on requestStats (cachedInputTokens and
 * cacheWriteTokens against inputTokens); below ~22% read back, set this to 'off' again.
 */
const CLAUDE_CACHE: ClaudeAgent['cacheTtl'] = '5m';

// Route the library's agent-activity logging through the app's BetterStack pipeline.
// Module-load side effect: every agent-creation path goes through this factory, so the
// logger is always wired before the first agent logs.
setLlmLogger(logger);

// The free-tier spend caps, enforced before EVERY LLM call from one place. Every call
// site stamps `agent.userId` (the paying user) on the agent it creates, and the library
// runs this hook before each ask; a throwing hook means nothing reaches the provider.
// Wiring it here rather than at the ~10 call sites is the point: a forgotten call site
// was exactly how image and preview spend went untracked before (see cost-tracking.ts).
// Paid users pass straight through inside the guard.
setBeforeAskHook(async (agent) => {
    if (agent.userId) {
        await assertFreeSpendWithinLimit(agent.userId);
    }
});

// While a re-send runs, the game doc carries an `llmRetry` notice that the page polls for
// (getLlmRetryNotice), so the loading rail can say why the turn is taking longer; the
// settle function removes it as soon as the ask is over, either way. Preview generation
// has no game yet and shows nothing. A failed write costs only the notice: the library
// logs it and retries regardless.
setRetryHook(async ({ agent, model, error, attempt }) => {
    const gameId = agent.gameId;
    if (!gameId || !db) return;
    const notice: LlmRetryNotice = {
        actor: agent.name,
        model,
        reason: /empty/i.test(error.message) ? 'empty' : 'malformed',
        attempt,
        startedAt: Date.now(),
    };
    const gameRef = db.collection('games').doc(gameId);
    await gameRef.update({ llmRetry: notice });
    return async () => {
        await gameRef.update({ llmRetry: firestore.FieldValue.delete() });
    };
});

/**
 * Werewolf's agent factory: resolves deprecated persisted model ids and the RANDOM picker
 * entry (both app concepts), then delegates to the library factory.
 */
export class AgentFactory {

    static createAgent(
        name: string,
        instruction: string,
        llmType: string,
        apiKeys: ApiKeyMap,
        enableThinking: boolean = false
    ): AbstractAgent {
        let modelId = resolveModelId(llmType);

        if (modelId === LLM_CONSTANTS.RANDOM) {
            const options = (Object.values(LLM_CONSTANTS) as string[])
                .filter(type => type !== LLM_CONSTANTS.RANDOM);
            modelId = options[Math.floor(Math.random() * options.length)];
        }

        const agent = LibAgentFactory.createAgent(name, instruction, modelId, apiKeys, enableThinking);
        agent.invalidResponseRetries = LLM_INVALID_RESPONSE_RETRIES;
        if (agent instanceof ClaudeAgent) {
            agent.cacheTtl = CLAUDE_CACHE;
        }
        return agent;
    }
}
