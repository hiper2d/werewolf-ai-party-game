import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AgentMessageDto } from "@/app/ai/models";

import { Anthropic } from '@anthropic-ai/sdk';
import MessageParam from '@anthropic-ai/sdk/resources';

interface Message {
    role: string;
    content: string;
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly model: string;

    constructor(id: string, name: string, instruction: string, model: string, apiKey: string) {
        super(id, name, instruction, 0.2);
        this.client = new Anthropic({
            apiKey: apiKey,
        });
        this.model = model;
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking ${this.name} agent. Last message: ${messages[messages.length - 1].msg}`);

        try {
            const systemMessage = messages[0].msg;

            const params: Anthropic.MessageCreateParams = {
                max_tokens: 1024,
                system: this.instruction,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.msg
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
