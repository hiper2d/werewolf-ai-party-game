import {ApiKeyMap} from '@/app/api/game-models';
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Gpt5Agent} from "@/app/ai/gpt-5-agent";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {ClaudeAgent} from "@/app/ai/anthropic-agent";
import {GoogleAgent} from "@/app/ai/google-agent";
import {MistralAgent} from "@/app/ai/mistral-agent";
import {DeepSeekV2Agent} from "@/app/ai/deepseek-v2-agent";
import {GrokAgent} from "@/app/ai/grok-agent";
import {KimiAgent} from "@/app/ai/kimi-agent";

export class AgentFactory {

    static createAgent(
        name: string,
        instruction: string,
        llmType: string,
        apiKeys: ApiKeyMap,
        enableThinking: boolean = false
    ): AbstractAgent {
        const modelName = this.validateLlmTypeAndGet(llmType)
        const model = SupportedAiModels[modelName]
        const apiKeyName = model.apiKeyName
        const key = apiKeys[apiKeyName]

        // Determine if thinking should be enabled based on model configuration
        const shouldEnableThinking = model.hasThinking;

        switch (modelName) {
            // Claude models - both regular and thinking versions
            case LLM_CONSTANTS.CLAUDE_4_OPUS:
            case LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING:
            case LLM_CONSTANTS.CLAUDE_4_SONNET:
            case LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING:
            case LLM_CONSTANTS.CLAUDE_4_HAIKU:
            case LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING:
                return new ClaudeAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
                
            // Always-on reasoning models
            case LLM_CONSTANTS.GPT_5:
            case LLM_CONSTANTS.GPT_5_MINI:
                return new Gpt5Agent(name, instruction, model.modelApiName, key, 1, shouldEnableThinking);
            case LLM_CONSTANTS.GEMINI_25_PRO:
                return new GoogleAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
            case LLM_CONSTANTS.GROK_4:
                return new GrokAgent(name, instruction, model.modelApiName, key, 0.7, shouldEnableThinking);

            // DeepSeek models - separate chat and reasoner
            case LLM_CONSTANTS.DEEPSEEK_CHAT:
            case LLM_CONSTANTS.DEEPSEEK_REASONER:
                return new DeepSeekV2Agent(name, instruction, model.modelApiName, key, 0.6, shouldEnableThinking);
                
            // Mistral models
            case LLM_CONSTANTS.MISTRAL_3_MEDIUM:
            case LLM_CONSTANTS.MISTRAL_2_LARGE:
            case LLM_CONSTANTS.MISTRAL_MAGISTRAL:
                return new MistralAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
            case LLM_CONSTANTS.KIMI_K2:
                return new KimiAgent(name, instruction, model.modelApiName, key, 0.6, shouldEnableThinking);
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
}
