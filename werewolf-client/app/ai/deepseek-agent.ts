import OpenAI from "openai";
import {AIMessage} from "@/app/api/game-models";
import {AbstractAgent} from "@/app/ai/abstract-agent";

export class DeepSeekAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly apiKey: string;

    constructor(
        name: string,
        instruction: string,
        model: string,
        apiKey: string,
        temperature: number = 0.7
    ) {
        super(name, instruction, model, temperature);
        this.apiKey = apiKey;
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: this.apiKey
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.model} agent. Last message: ${messages[messages.length-1].content}`);

        const preparedMessages = this.prepareMessages(messages);
        if (preparedMessages.length > 0) {
            preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
        }

        try {
            const completion = await this.client.chat.completions.create({
                messages: preparedMessages,
                model: this.model,
                temperature: this.temperature
            });

            const reply = completion.choices[0].message?.content;
            this.logger(`Reply: ${reply}`);
            return reply || null;
        } catch (error) {
            console.error('Error in DeepSeekAgent.ask:', error);
            return null;
        }
    }
}
