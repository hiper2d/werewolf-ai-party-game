import {AbstractAgent} from "@/app/ai/AbstractAgent";
import OpenAI from "openai";
import {User} from "@/app/api/models";
import {AgentMessageDto, LLMModel} from "@/app/ai/models";

export class OpenAIAgent extends AbstractAgent {
    constructor(name: string, user: User) {
        const client = new OpenAI({
            apiKey: user.keys[LLMModel.GPT4].value,
        })
        super("rand", name, 'TBD', LLMModel.GPT4, 0.2, client);
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const cl = this.client as OpenAI

        try {
            const response = await this.client.createChatCompletion({
                model: this.model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.msg
                })),
                temperature: this.temperature,
            });

            const reply = response.data.choices[0].message?.content;
            this.logger(`Reply: ${reply}`);
            return reply || null;
        } catch (error) {
            console.error('Error in OpenAIAgent.ask:', error);
            return null;
        }
    }
}