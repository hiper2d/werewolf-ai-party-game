import { AIMessage, TokenUsage } from "@/app/api/game-models";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import logger from "@/app/utils/logger-utils";

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

    // Template Method pattern: public methods with logging, calling protected abstract methods
    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        /*this.logger(`Asking bot ${this.name} (${this.model})`);
        if (this.instruction) {
            this.logger(this.instruction);
        }
        if (messages.length > 0) {
            this.logMessages([messages[messages.length - 1]]);
        }*/

        try {
            const [result, thinking, tokenUsage] = await this.doAskWithSchema(schema, messages);
            this.logger(`Bot ${this.name} replied: ${result}`);
            if (thinking) {
                this.logger(`Bot ${this.name} thoughts: ${thinking}`);
            }
            if (tokenUsage) {
                this.logger(`Bot ${this.name} token usage: ${tokenUsage.totalTokens} tokens (${tokenUsage.inputTokens} input, ${tokenUsage.outputTokens} output), cost: $${tokenUsage.costUSD.toFixed(4)}`);
            }
            return [result, thinking, tokenUsage];
        } catch (error) {
            this.logger(`${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    // Abstract methods that child classes must implement
    protected abstract doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]>;

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


    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}
