import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { Anthropic } from '@anthropic-ai/sdk';

interface Message {
    role: string;
    content: string;
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new Anthropic({
            apiKey: apiKey,
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.model} agent. Last message: ${messages[messages.length-1].content}`);

        try {
            const aiMessages = this.prepareMessages(messages);

            const params: Anthropic.MessageCreateParams = {
                max_tokens: 1024,
                system: this.instruction,
                messages: aiMessages.map(msg => ({
                    role: msg.role === 'system' ? 'user' : msg.role,  // Claude doesn't support system role in messages
                    content: msg.content
                })),
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
