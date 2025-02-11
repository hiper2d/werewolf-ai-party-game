import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage} from "@/app/api/game-models";

export class OpenAiAgent extends AbstractAgent {
    private readonly client: OpenAI;

    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number) {
        super(name, instruction, model, temperature);
        this.client = new OpenAI({
            apiKey: apiKey,
        })
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent. Last message: ${messages[messages.length-1].content}`);
        messages.forEach((msg) => {
            this.logger(msg.content);
        })

        const preparedMessages = this.prepareMessages(messages);
        if (preparedMessages.length > 0) {
            preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
        }

        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: preparedMessages,
                temperature: this.temperature,
            });

            const reply = completion.choices[0].message?.content;
            this.logger(`Reply: ${reply}`);
            return reply || null;
        } catch (error) {
            console.error('Error in OpenAiAgent.ask:', error);
            return null;
        }
    }
}