import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import {AIMessage, MESSAGE_ROLE, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly defaultParams: Omit<Parameters<Mistral['chat']['complete']>[0], 'messages'> = {
        model: this.model,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Mistral API',
        invalidFormat: 'Invalid response format from Mistral API',
        apiError: (error: unknown) =>
            `Failed to get response from Mistral API: ${error instanceof Error ? error.message : String(error)}`,
    };

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.2, enableThinking);
        this.client = new Mistral({apiKey: apiKey});
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        const schemaInstructions = this.schemaTemplate.instructions(schema);

        try {
            // Combine system instruction with schema instructions
            const systemContent = `${this.instruction}\n\n${schemaInstructions}`;

            const chatResponse = await this.client.chat.complete({
                model: this.model,
                messages: [
                    { role: MESSAGE_ROLE.SYSTEM, content: systemContent },
                    ...this.convertToMistralMessages(messages)
                ],
                responseFormat: {type: 'json_object'}
            });

            return this.processReply(chatResponse);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private convertToMistralMessages(messages: AIMessage[]) {
        return messages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role,
            content: msg.content
        }));
    }

    private processReply(response: ChatCompletionResponse | undefined): [string, string, TokenUsage?] {
        let reply = response?.choices?.[0]?.message?.content;

        if (reply === undefined || reply === null) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        if (Array.isArray(reply)) {
            reply = this.processArrayReply(reply);
        }

        return [cleanResponse(reply), "", undefined];
    }

    private processArrayReply(reply: unknown[]): string {
        return reply.map(chunk => {
            if (typeof chunk === "string") {
                return chunk;
            }
            if (typeof chunk === "object" && chunk !== null &&
                "type" in chunk && chunk.type === "text" &&
                "text" in chunk) {
                return chunk.text;
            }
            return "";
        }).join("");
    }
}