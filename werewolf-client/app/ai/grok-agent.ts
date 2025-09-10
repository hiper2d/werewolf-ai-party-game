import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";

export class GrokAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Grok API',
        invalidFormat: 'Invalid response format from Grok API',
        apiError: (error: unknown) =>
            `Failed to get response from Grok API: ${error instanceof Error ? error.message : String(error)}`,
    };

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number, enableThinking: boolean = false) {
        super(name, instruction, model, temperature, enableThinking);
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.x.ai/v1',
        });
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        const schemaInstructions = this.schemaTemplate.instructions(schema);

        try {
            const preparedMessages = this.prepareMessagesWithInstruction(messages, schemaInstructions);
            
            const requestParams = {
                ...this.defaultParams,
                messages: preparedMessages,
            };
            
            const completion = await this.client.chat.completions.create(requestParams) as OpenAI.Chat.Completions.ChatCompletion;

            return this.processReply(completion);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private prepareMessagesWithInstruction(messages: AIMessage[], schemaInstructions?: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const preparedMessages = this.prepareMessages(messages);
        
        // Combine instruction with schema instructions if provided
        const fullInstruction = schemaInstructions 
            ? `${this.instruction}\n\n${schemaInstructions}`
            : this.instruction;
        
        // Add system message with instruction at the beginning
        const systemMessage: AIMessage = {
            role: 'system',
            content: fullInstruction
        };
        
        const messagesWithSystem = [systemMessage, ...preparedMessages];
        return this.convertToOpenAIMessages(messagesWithSystem);
    }

    private convertToOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
        }));
    }

    private processReply(completion: OpenAI.Chat.Completions.ChatCompletion): [string, string, TokenUsage?] {
        const reply = completion.choices[0]?.message?.content;
        const message = completion.choices[0]?.message;

        // Debug: Log the entire message structure
        this.logger(`Grok Agent - Full message structure: ${JSON.stringify(message, null, 2)}`);

        // Extract reasoning content if available (grok-4 is reasoning-only)
        const reasoningContent: string = (message as any)?.reasoning_content || "";
        
        this.logger(`Grok Agent - Found reasoning_content: ${!!reasoningContent}, length: ${reasoningContent.length}`);

        if (!reply) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        return [cleanResponse(reply), reasoningContent, undefined];
    }
}