import { User } from '@/app/api/models';
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAiAgent} from "@/app/ai/open-ai-agent";
import {LLMModel} from "@/app/ai/models";

export class AgentFactory {

    static createAgent(
        id: string,
        name: string,
        instruction: string,
        llmType: LLMModel,
        user: User
    ): AbstractAgent {
        switch (llmType) {
            case LLMModel.GPT_4O:
                return new OpenAiAgent(id, name, instruction, user);
            default:
                throw new Error(`Unknown LLMType: ${llmType}`);
        }
    }

    static createAnonymousAgent(
        instruction: string,
        llmType: LLMModel,
        user: User
    ): AbstractAgent {
        switch (llmType) {
            case LLMModel.GPT_4O:
                return new OpenAiAgent("anonymous", "anonymous", instruction, user);
            default:
                throw new Error(`Unknown LLMType: ${llmType}`);
        }
    }
}
