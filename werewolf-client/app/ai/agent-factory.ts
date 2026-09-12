import { AgentFactory as LibAgentFactory, AbstractAgent, setLlmLogger, setBeforeAskHook } from '@hiper2d/ai-agents';
import type { ApiKeyMap } from '@hiper2d/ai-agents';
import { LLM_CONSTANTS, resolveModelId } from '@/app/ai/ai-models';
import { logger } from '@/app/utils/logger';
import { assertFreeSpendWithinLimit } from '@/app/api/user-actions';

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

        return LibAgentFactory.createAgent(name, instruction, modelId, apiKeys, enableThinking);
    }
}
