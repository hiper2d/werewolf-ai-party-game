import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage} from "@/app/api/game-models";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

export class OpenAiO1Agent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        messages: (msgs: AIMessage[]) => `Messages:\n${JSON.stringify(msgs, null, 2)}`,
        rawReply: (reply: unknown) => `Raw reply: ${reply}`,
        finalReply: (reply: string) => `Final reply: ${reply}`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from OpenAI API',
        invalidFormat: 'Invalid response format from OpenAI API',
        apiError: (error: unknown) =>
            `Failed to get response from OpenAI API: ${error instanceof Error ? error.message : String(error)}`,
    };

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 1);
        this.client = new OpenAI({
            apiKey: apiKey,
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        return null; // Method kept empty to maintain inheritance
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string> {
        this.logger(this.logTemplates.askingAgent(this.name, this.model));
        this.logger(this.logTemplates.messages(messages));

        const schemaInstructions = this.schemaTemplate.instructions(schema);
        const lastMessage = messages[messages.length - 1];
        const fullPrompt = `${lastMessage.content}\n\n${schemaInstructions}`;
        const modifiedMessages = [
            ...messages.slice(0, -1),
            { ...lastMessage, content: fullPrompt }
        ];

        try {
            const preparedMessages = this.prepareMessagesWithInstruction(modifiedMessages);
            const completion = await this.client.chat.completions.create({
                ...this.defaultParams,
                messages: preparedMessages,
            }) as OpenAI.Chat.Completions.ChatCompletion;

            const reply = this.processReply(completion);
            this.logger(this.logTemplates.finalReply(reply));
            return reply;
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private prepareMessagesWithInstruction(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const preparedMessages = this.prepareMessages(messages);
        if (preparedMessages.length > 0) {
            preparedMessages[0].content = `${this.instruction}\n\n${preparedMessages[0].content}`;
        }
        return preparedMessages;
    }

    private processReply(completion: OpenAI.Chat.Completions.ChatCompletion): string {
        const reply = completion.choices[0]?.message?.content;
        this.logger(this.logTemplates.rawReply(reply));

        if (!reply) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        return cleanResponse(reply);
    }
}