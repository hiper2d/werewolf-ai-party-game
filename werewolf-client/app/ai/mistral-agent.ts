import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import { AIMessage, GameMessage, MESSAGE_ROLE } from "@/app/api/game-models";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly model: string;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, 0.2);
        this.model = model;
        this.client = new Mistral({apiKey: apiKey});
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const chatResponse: ChatCompletionResponse | undefined = await this.client.chat.complete({
            model: this.model,
            messages: [
                {role: MESSAGE_ROLE.SYSTEM, content: this.instruction},
                ...messages
            ],
        });

        const reply = chatResponse?.choices?.[0]?.message?.content;
        this.logger(`Reply: ${reply}`);
        return reply;
    }
}