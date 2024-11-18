import {AbstractAgent} from "@/app/ai/abstract-agent";
import {AgentMessageDto} from "@/app/ai/ai-models";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly model: string;

    constructor(id: string, name: string, instruction: string, model: string, apiKey: string) {
        super(id, name, instruction, 0.2);
        this.model = model;
        this.client = new Mistral({apiKey: apiKey});
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        const chatResponse: ChatCompletionResponse = await this.client.chat.complete({
            model: 'mistral-large-latest',
            messages: [{role: 'user', content: messages[0].msg}],
        });

        const reply = chatResponse.choices[0]?.message?.content;
        this.logger(`Reply: ${reply}`);
        return reply;
    }
}