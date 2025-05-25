import {ApiKeyMap} from '@/app/api/game-models';
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAiAgent} from "@/app/ai/open-ai-agent";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {ClaudeAgent} from "@/app/ai/anthropic-agent";
import {GoogleAgent} from "@/app/ai/google-agent";
import {MistralAgent} from "@/app/ai/mistral-agent";
import {OpenAiOAgent} from "@/app/ai/open-ai-o-agent";
import {DeepSeekAgent} from "@/app/ai/deepseek-agent";

export class AgentFactory {

    static createAgent(
        name: string,
        instruction: string,
        llmType: string,
        apiKeys: ApiKeyMap
    ): AbstractAgent {
        const modelName = this.validateLlmTypeAndGet(llmType)
        const model = SupportedAiModels[modelName]
        const apiKeyName = model.apiKeyName
        const key = apiKeys[apiKeyName]

        switch (modelName) {
            case LLM_CONSTANTS.CLAUDE_4_OPUS:
            case LLM_CONSTANTS.CLAUDE_4_SONNET:
            case LLM_CONSTANTS.CLAUDE_35_HAIKU:
                return new ClaudeAgent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.GPT_41:
                return new OpenAiAgent(name, instruction, model.modelApiName, key, 0.2);
            case LLM_CONSTANTS.GPT_O4_MINI:
                return new OpenAiOAgent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.GEMINI_25_FLASH:
            case LLM_CONSTANTS.GEMINI_25_PRO:
                return new GoogleAgent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.MISTRAL_3_SMALL:
            case LLM_CONSTANTS.MISTRAL_2_LARGE:
                return new MistralAgent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.DEEPSEEK_CHAT:
            case LLM_CONSTANTS.DEEPSEEK_REASONER:
                return new DeepSeekAgent(name, instruction, model.modelApiName, key);
            default:
                throw new Error(`Unknown Key: ${modelName}`);
        }
    }

    private static validateLlmTypeAndGet(llmType: string): string {
        const llmValues = Object.values(LLM_CONSTANTS) as string[];

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

    private static logger(message: string, model: string, instruction: string): void {
        console.log(`[${this.name} ${model}]: Creating agent, system instruction: ${instruction}`);
    }
}
