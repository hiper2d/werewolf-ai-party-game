import { ApiKeyMap } from '@/app/api/game-models';
import { AbstractAgent } from "@/app/ai/abstract-agent";
import { Gpt5Agent } from "@/app/ai/gpt-5-agent";
import { LLM_CONSTANTS, SupportedAiModels, resolveModelId } from "@/app/ai/ai-models";
import { ClaudeAgent } from "@/app/ai/anthropic-agent";
import { GoogleAgent } from "@/app/ai/google-agent";
import { MistralAgent } from "@/app/ai/mistral-agent";
import { DeepSeekV2Agent } from "@/app/ai/deepseek-v2-agent";
import { GrokAgent } from "@/app/ai/grok-agent";
import { KimiAgent } from "@/app/ai/kimi-agent";
import { GlmAgent } from "@/app/ai/glm-agent";
import { FuguAgent } from "@/app/ai/fugu-agent";

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
            case LLM_CONSTANTS.CLAUDE_FABLE:
            case LLM_CONSTANTS.CLAUDE_4_OPUS:
            case LLM_CONSTANTS.CLAUDE_4_OPUS_THINKING:
            case LLM_CONSTANTS.CLAUDE_4_SONNET:
            case LLM_CONSTANTS.CLAUDE_4_SONNET_THINKING:
            case LLM_CONSTANTS.CLAUDE_4_HAIKU:
            case LLM_CONSTANTS.CLAUDE_4_HAIKU_THINKING:
                return new ClaudeAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);

            // Always-on reasoning models
            case LLM_CONSTANTS.GPT_5_6_SOL:
            case LLM_CONSTANTS.GPT_5_6_TERRA:
            case LLM_CONSTANTS.GPT_5_6_LUNA:
                return new Gpt5Agent(name, instruction, model.modelApiName, key, model.temperature!, shouldEnableThinking);
            case LLM_CONSTANTS.GEMINI_3_PRO:
            case LLM_CONSTANTS.GEMINI_3_FLASH:
            case LLM_CONSTANTS.GEMINI_3_FLASH_LITE:
                return new GoogleAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
            case LLM_CONSTANTS.GROK_4_5:
                return new GrokAgent(name, instruction, model.modelApiName, key, model.temperature!, shouldEnableThinking);

            // DeepSeek V4 models - flash and pro, with thinking toggle
            case LLM_CONSTANTS.DEEPSEEK_V4_FLASH:
            case LLM_CONSTANTS.DEEPSEEK_V4_FLASH_THINKING:
            case LLM_CONSTANTS.DEEPSEEK_V4_PRO:
            case LLM_CONSTANTS.DEEPSEEK_V4_PRO_THINKING:
                return new DeepSeekV2Agent(name, instruction, model.modelApiName, key, model.temperature ?? 0, shouldEnableThinking);

            // Mistral models
            case LLM_CONSTANTS.MISTRAL_3_5_MEDIUM:
            case LLM_CONSTANTS.MISTRAL_4_SMALL:
            case LLM_CONSTANTS.MISTRAL_3_LARGE:
            case LLM_CONSTANTS.MISTRAL_MAGISTRAL:
                return new MistralAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
            case LLM_CONSTANTS.KIMI:
                // Kimi K3 rejects any temperature but 1; the agent never sends the field.
                return new KimiAgent(name, instruction, model.modelApiName, key, 0, shouldEnableThinking);

            // Z.AI models
            case LLM_CONSTANTS.GLM:
            case LLM_CONSTANTS.GLM_THINKING:
                return new GlmAgent(name, instruction, model.modelApiName, key, model.temperature!, shouldEnableThinking);

            // Sakana Fugu models — always-on reasoning, no temperature (ignored by the model)
            case LLM_CONSTANTS.FUGU:
            case LLM_CONSTANTS.FUGU_ULTRA:
                return new FuguAgent(name, instruction, model.modelApiName, key, shouldEnableThinking);
            default:
                throw new Error(`Unknown Key: ${modelName}`);
        }
    }

    private static validateLlmTypeAndGet(llmType: string): string {
        // Deprecated model IDs live on in old game docs; resolveModelId is the shared map.
        const migratedType = resolveModelId(llmType);

        const llmValues = Object.values(LLM_CONSTANTS) as string[];

        // Check if llmType is one of the constants
        if (!llmValues.includes(migratedType)) {
            throw new Error(`Invalid llmType: ${llmType}`);
        }

        // If llmType is RANDOM, pick one randomly from other constants
        if (migratedType === LLM_CONSTANTS.RANDOM) {
            // Exclude RANDOM from the options
            const llmOptions = llmValues.filter(type => type !== LLM_CONSTANTS.RANDOM);
            const randomIndex = Math.floor(Math.random() * llmOptions.length);
            return llmOptions[randomIndex];
        }

        // Return the migrated llmType
        return migratedType;
    }
}
