import { AgentFactory as LibAgentFactory, AbstractAgent, setLlmLogger } from '@hiper2d/llm-agents';
import type { ApiKeyMap } from '@hiper2d/llm-agents';
import { LLM_CONSTANTS, resolveModelId } from '@/app/ai/ai-models';
import { logger } from '@/app/utils/logger';

// Route the library's agent-activity logging through the app's BetterStack pipeline.
// Module-load side effect: every agent-creation path goes through this factory, so the
// logger is always wired before the first agent logs.
setLlmLogger(logger);

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
