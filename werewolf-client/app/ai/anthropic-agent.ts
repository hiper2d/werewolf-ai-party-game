import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { convertToAIMessages } from "@/app/utils/message-utils";
import { Anthropic } from '@anthropic-ai/sdk';
import MessageParam from '@anthropic-ai/sdk/resources';

interface Message {
    role: string;
    content: string;
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly model: string;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, 0.2);
        this.client = new Anthropic({
            apiKey: apiKey,
        });
        this.model = model;
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} agent. Last message: ${messages[messages.length - 1].content}`);

        try {
            const aiMessages = this.prepareMessages(messages);

            const params: Anthropic.MessageCreateParams = {
                max_tokens: 1024,
                system: this.instruction,
                messages: aiMessages.filter(msg => msg.role !== 'system').map(msg => ({
                    role: msg.role,
                    content: msg.content
                } as MessageParam)),
                model: this.model,
                temperature: this.temperature,
            }

            const response = await this.client.messages.create(params);

            // Handle the response content safely
            if (response.content && response.content.length > 0 && 'text' in response.content[0]) {
                const reply = response.content[0].text;
                this.logger(`Reply: ${reply}`);
                return reply;
            }
            throw new Error('Unexpected response format from Anthropic API');
        } catch (error) {
            console.error('Error in ClaudeAgent.ask:', error);
            return null;
        }
    }
}
