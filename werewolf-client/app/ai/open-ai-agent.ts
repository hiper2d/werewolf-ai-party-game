import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage} from "@/app/api/game-models";

export class OpenAiAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number) {
        super(name, instruction, temperature);
        this.model = model;
        this.client = new OpenAI({
            apiKey: apiKey,
        })
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].content}`);

        const aiMessages = this.prepareMessages(messages);

        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: aiMessages,
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