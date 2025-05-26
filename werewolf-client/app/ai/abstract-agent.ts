import { AIMessage } from "@/app/api/game-models";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import logger from "@/app/utils/logger-utils";

export abstract class AbstractAgent {
    name: string;
    protected readonly instruction: string;
    protected readonly temperature: number;
    protected readonly model: string;

    protected constructor(name: string, instruction: string, model: string, temperature: number) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
        this.model = model;
    }

    // Template Method pattern: public methods with logging, calling protected abstract methods
    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking bot ${this.name} (${this.model})`);
        this.logMessages(messages);
        
        try {
            const result = await this.doAsk(messages);
            this.logger(`Bot ${this.name}: ${result}`);
            return result;
        } catch (error) {
            this.logger(`${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking bot ${this.name} (${this.model})`);
        this.logMessages(messages);
        
        try {
            const result = await this.doAskWithSchema(schema, messages);
            this.logger(`Bot ${this.name} replied: ${result}`);
            return result;
        } catch (error) {
            this.logger(`${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    // Abstract methods that child classes must implement
    protected abstract doAsk(messages: AIMessage[]): Promise<string | null>;
    protected abstract doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null>;

    protected logger(message: string): void {
        logger(`[${this.name} ${this.model}]: ${message}`);
    }

    protected logMessages(messages: AIMessage[]): void {
        this.logger(`History for ${this.name}:`);
        messages.forEach((msg, index) => {
            const preview = msg.content.length > 5000 ? msg.content.substring(0, 5000) + '...' : msg.content;
            this.logger(`  ${index + 1}. [${msg.role}]: ${preview}`);
        });
    }

    protected logReasoningTokens(reasoningTokens: string): void {
        this.logger(`Bot ${this.name} thoughts: ${reasoningTokens}`);
    }

    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}
