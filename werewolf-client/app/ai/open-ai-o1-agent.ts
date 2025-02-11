import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage} from "@/app/api/game-models";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

export class OpenAiO1Agent extends AbstractAgent {
    private readonly client: OpenAI;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 1);
        this.client = new OpenAI({
            apiKey: apiKey,
        })
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} agent. Last message: ${messages[messages.length-1].content}`);

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
            this.logger(`Raw reply: ${reply}`);
            if (!reply) return null;
            
            const cleanedReply = cleanResponse(reply);
            this.logger(`Final reply: ${cleanedReply}`);
            return cleanedReply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} agent with schema.`);
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

            // Prepare messages and add instruction to the first message
            const preparedMessages = this.prepareMessages(modifiedMessages);
            if (preparedMessages.length > 0) {
                preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
            }

            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: preparedMessages,
                temperature: this.temperature,
            });

            const reply = completion.choices[0].message?.content;
            this.logger(`Raw reply: ${reply}`);
            if (!reply) return null;
            
            const cleanedReply = cleanResponse(reply);
            this.logger(`Final reply: ${cleanedReply}`);
            return cleanedReply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }
}