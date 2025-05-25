import OpenAI from "openai";
import {AIMessage} from "@/app/api/game-models";
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";

// DeepSeek specific types
interface DeepSeekMessage {
    role: string;
    content: string;
    reasoning_content?: string;
}

interface DeepSeekChoice {
    message?: DeepSeekMessage;
    index: number;
    finish_reason: string | null;
}

interface DeepSeekCompletion {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: DeepSeekChoice[];
}

export class DeepSeekAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from DeepSeek API',
        invalidFormat: 'Invalid response format from DeepSeek API',
        apiError: (error: unknown) =>
            `Failed to get response from DeepSeek API: ${error instanceof Error ? error.message : String(error)}`,
    };

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(
        name: string,
        instruction: string,
        model: string,
        apiKey: string,
        temperature: number = 0.6
    ) {
        super(name, instruction, model, temperature);
        this.client = new OpenAI({
            baseURL: "https://api.deepseek.com",
            apiKey: apiKey,
        });
    }

    protected async doAsk(messages: AIMessage[]): Promise<string | null> {
        return null; // Method kept empty to maintain inheritance
    }

    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string> {
        const schemaInstructions = this.schemaTemplate.instructions(schema);
        const lastMessage = messages[messages.length - 1];
        const fullPrompt = `${lastMessage.content}\n\n${schemaInstructions}`;
        const modifiedMessages = [
            ...messages.slice(0, -1),
            { ...lastMessage, content: fullPrompt }
        ];

        try {
            const preparedMessages = this.prepareMessagesWithInstruction(modifiedMessages);
            const params = {
                ...this.defaultParams,
                messages: preparedMessages,
            };

            // Only add response_format for DeepSeek Chat model
            if (this.model === SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_CHAT].modelApiName) {
                params.response_format = { type: 'json_object' };
            }

            const completion = await this.client.chat.completions.create(params) as DeepSeekCompletion;

            return this.processCompletion(completion);
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

    private processCompletion(completion: DeepSeekCompletion): string {
        const reply = completion.choices[0]?.message?.content;

        const reasoning = completion.choices[0]?.message?.reasoning_content;
        if (reasoning !== undefined) {
            this.logReasoningTokens(reasoning);
        }

        if (!reply) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        return cleanResponse(reply);
    }
}
