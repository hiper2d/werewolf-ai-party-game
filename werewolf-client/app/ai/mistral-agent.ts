import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import { AIMessage, GameMessage, MESSAGE_ROLE } from "@/app/api/game-models";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new Mistral({apiKey: apiKey});
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent. Last message: ${messages[messages.length-1].content}`);

        try {
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
            reply = cleanResponse(reply);
            this.logger(`Final reply: ${reply}`);
            return reply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent with schema.`);
        this.logger(`Messages:\n${JSON.stringify(messages, null, 2)}`);

        try {
            // Construct the schema instructions
            const schemaInstructions = `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`;

            // Modify the last message to include schema instructions
            const lastMessage = messages[messages.length - 1];
            const fullPrompt = `${lastMessage.content}

${schemaInstructions}`;
            const modifiedMessages = [
                ...messages.slice(0, -1),
                { ...lastMessage, content: fullPrompt }
            ];

            const chatResponse: ChatCompletionResponse | undefined = await this.client.chat.complete({
                model: this.model,
                messages: [
                    { role: MESSAGE_ROLE.SYSTEM, content: this.instruction },
                    ...modifiedMessages
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
            reply = cleanResponse(reply);
            this.logger(`Final reply: ${reply}`);
            return reply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }
}