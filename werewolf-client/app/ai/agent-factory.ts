import {ApiKeyMap} from '@/app/api/models';
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAiAgent} from "@/app/ai/open-ai-agent";
import {LLM_CONSTANTS, SupportedAiModelNames} from "@/app/ai/models";

export class AgentFactory {

    static createAgent(
        id: string,
        name: string,
        instruction: string,
        llmType: string,
        apiKeys: ApiKeyMap
    ): AbstractAgent {
        const validatedLlmType = this.validateLlmTypeAndGet(llmType)
        const modelName = SupportedAiModelNames[validatedLlmType]
        const key = apiKeys[validatedLlmType].value
        switch (validatedLlmType) {
            case LLM_CONSTANTS.GPT_4O:
            case LLM_CONSTANTS.GPT_4O_MINI:
                return new OpenAiAgent(id, name, instruction, modelName, key);
            default:
                throw new Error(`Unknown LLMType: ${llmType}`);
        }
    }

    static createAnonymousAgent(
        instruction: string,
        llmType: string,
        apiKeys: ApiKeyMap
    ): AbstractAgent {
        const validatedLlmType = this.validateLlmTypeAndGet(llmType)
        const modelName = SupportedAiModelNames[validatedLlmType]
        const key = apiKeys[validatedLlmType].value
        switch (validatedLlmType) {
            case LLM_CONSTANTS.GPT_4O:
            case LLM_CONSTANTS.GPT_4O_MINI:
                return new OpenAiAgent("anonymous", "anonymous", instruction, modelName, key);
            default:
                throw new Error(`Unknown LLMType: ${llmType}`);
        }
    }

    private static validateLlmTypeAndGet(llmType: string): string {
        const llmValues = Object.values(LLM_CONSTANTS);

        // Check if llmType is one of the constants
        if (!llmValues.includes(llmType)) {
            throw new Error(`Invalid llmType: ${llmType}`);
        }

        // If llmType is RANDOM, pick one randomly from other constants
        if (llmType === LLM_CONSTANTS.RANDOM) {
            // Exclude RANDOM from the options
            const llmOptions = llmValues.filter(type => type !== LLM_CONSTANTS.RANDOM);
            const randomIndex = Math.floor(Math.random() * llmOptions.length);
            return llmOptions[randomIndex];
        }

        // Return the llmType as it is
        return llmType;
    }
}
