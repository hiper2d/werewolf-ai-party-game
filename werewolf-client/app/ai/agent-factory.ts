import {ApiKeyMap} from '@/app/api/game-models';
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAiAgent} from "@/app/ai/open-ai-agent";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {ClaudeAgent} from "@/app/ai/anthropic-agent";
import {GoogleAgent} from "@/app/ai/google-agent";
import {MistralAgent} from "@/app/ai/mistral-agent";
import {OpenAiO1Agent} from "@/app/ai/open-ai-o1-agent";
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

        this.logger(name, model.modelApiName, instruction)
        switch (modelName) {
            case LLM_CONSTANTS.CLAUDE_35_HAIKU:
            case LLM_CONSTANTS.CLAUDE_37_SONNET:
                return new ClaudeAgent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.GPT_4O_MINI:
            case LLM_CONSTANTS.GPT_4O:
                return new OpenAiAgent(name, instruction, model.modelApiName, key, 0.2);
            case LLM_CONSTANTS.GPT_O3_MINI:
            case LLM_CONSTANTS.GPT_O1:
                return new OpenAiO1Agent(name, instruction, model.modelApiName, key);
            case LLM_CONSTANTS.GEMINI_2_FLASH:
            case LLM_CONSTANTS.GEMINI_15_PRO:
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
