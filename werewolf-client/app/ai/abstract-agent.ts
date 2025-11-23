import { AIMessage, TokenUsage } from "@/app/api/game-models";
import logger from "@/app/utils/logger-utils";
import { z } from 'zod';

export abstract class AbstractAgent {
    name: string;
    protected readonly instruction: string;
    protected readonly temperature: number;
    protected readonly model: string;
    protected readonly enableThinking: boolean;

    protected constructor(name: string, instruction: string, model: string, temperature: number, enableThinking: boolean = false) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
        this.model = model;
        this.enableThinking = enableThinking;
    }

    abstract askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]>;

    protected logger(message: string): void {
        logger(`[${this.name} ${this.model}]: ${message}`);
    }

    protected logSystemPrompt(): void {
        this.logger(`System Prompt: ${this.instruction}`);
    }

    protected logAsking(): void {
        this.logger("==================================================");
        this.logger(`Asking ${this.name} ${this.model} agent`);
        this.logger("==================================================");
    }

    protected logMessages(messages: AIMessage[]): void {
        this.logger(`History for ${this.name}:`);
        messages.forEach((msg, index) => {
            const preview = msg.content.length > 5000 ? msg.content.substring(0, 5000) + '...' : msg.content;
            this.logger(`  ${index + 1}. [${msg.role}]: ${preview}`);
        });
    }

    protected logReply(reply: string): void {
        this.logger(`Reply from ${this.name}:`);
        const preview = reply.length > 5000 ? reply.substring(0, 5000) + '...' : reply;
        this.logger(`  [assistant]: ${preview}`);
    }


    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}
