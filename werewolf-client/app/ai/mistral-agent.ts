import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import { AIMessage, GameMessage, MESSAGE_ROLE } from "@/app/api/game-models";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new Mistral({apiKey: apiKey});
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent. Last message: ${messages[messages.length-1].content}`);

        const chatResponse: ChatCompletionResponse | undefined = await this.client.chat.complete({
            model: this.model,
            messages: [
                { role: MESSAGE_ROLE.SYSTEM, content: this.instruction },
                ...messages
            ],
        });

        let reply = chatResponse?.choices?.[0]?.message?.content;
        this.logger(`Raw reply: ${reply}`);
        if (reply === undefined || reply === null) {
            return null;
        }
        if (Array.isArray(reply)) {
            // For each chunk, if it's a string, include it.
            // If it's an object and its type is 'text', then include its text property.
            // Otherwise ignore non-text chunks.
            reply = reply.map(chunk => {
                if (typeof chunk === "string") {
                    return chunk;
                } else if (typeof chunk === "object" && "type" in chunk && chunk.type === "text" && "text" in chunk) {
                    return chunk.text;
                }
                return "";
            }).join("");
        } else if (typeof reply !== "string") {
            return null;
        }
        this.logger(`Final reply: ${reply}`);
        return reply;
    }
}