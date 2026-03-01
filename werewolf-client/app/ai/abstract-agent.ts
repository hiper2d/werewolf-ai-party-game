import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { z } from 'zod';
import { logger } from "@/app/utils/logger";

export abstract class AbstractAgent {
    name: string;
    gameId?: string;
    userId?: string;
    protected readonly instruction: string;
    protected readonly temperature: number;
    protected readonly model: string;
    protected readonly enableThinking: boolean;
    protected readonly agentLoggingConfig: AgentLoggingConfig;

    protected constructor(
        name: string, 
        instruction: string, 
        model: string, 
        temperature: number, 
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
        this.model = model;
        this.enableThinking = enableThinking;
        this.agentLoggingConfig = agentLoggingConfig;
    }

    abstract askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]>;

    protected logger(message: string): void {
        console.log(`[${this.name} ${this.model}]: ${message}`);
    }

    protected logAsking(messages: AIMessage[]): void {
        this.logger("==================================================");
        this.logger(`Asking ${this.name} ${this.model} agent`);
        this.logger("==================================================");
        
        logger.agentActivity(this.name, this.model, 'REQUEST', {
            gameId: this.gameId,
            userId: this.userId,
            systemPrompt: this.instruction,
            history: messages,
            command: messages.length > 0 ? messages[messages.length - 1].content : undefined
        }, this.agentLoggingConfig);
    }

    protected logSystemPrompt(): void {
        // No longer needed as it's included in logAsking's Axiom log
        // Keeping it for backward compatibility with subclasses that might call it
    }

    protected logMessages(messages: AIMessage[]): void {
        // Console logging still useful for local dev
        this.logger(`History for ${this.name}:`);
        messages.forEach((msg, index) => {
            const preview = msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content;
            this.logger(`  ${index + 1}. [${msg.role}]: ${preview}`);
        });
    }

    protected logReply(reply: any, thinking?: string, usage?: TokenUsage): void {
        const replyStr = typeof reply === 'string' ? reply : JSON.stringify(reply);
        
        // Console logging
        this.logger(`Reply from ${this.name}:`);
        if (thinking) {
            const thinkingPreview = thinking.length > 500 ? thinking.substring(0, 500) + '...' : thinking;
            this.logger(`  [thinking]: ${thinkingPreview}`);
        }
        const preview = replyStr.length > 1000 ? replyStr.substring(0, 1000) + '...' : replyStr;
        this.logger(`  [assistant]: ${preview}`);

        logger.agentActivity(this.name, this.model, 'RESPONSE', {
            gameId: this.gameId,
            userId: this.userId,
            reply,
            thinking,
            usage
        }, this.agentLoggingConfig);
    }


    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}
