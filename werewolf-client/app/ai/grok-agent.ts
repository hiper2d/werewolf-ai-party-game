import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {cleanResponse} from "@/app/utils/message-utils";
import {calculateGrokCost} from "@/app/utils/pricing";
import {z} from 'zod';
import {ZodSchemaConverter} from './zod-schema-converter';
import {safeValidateResponse} from './prompts/zod-schemas';

export class GrokAgent extends AbstractAgent {
    private readonly client: OpenAI;
    private readonly defaultParams: Omit<Parameters<OpenAI['chat']['completions']['create']>[0], 'messages'> = {
        model: this.model,
        temperature: this.temperature,
        stream: false,
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Grok API',
        invalidFormat: 'Invalid response format from Grok API',
        apiError: (error: unknown) =>
            `Failed to get response from Grok API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number, enableThinking: boolean = false) {
        super(name, instruction, model, temperature, enableThinking);
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.x.ai/v1',
            timeout: 1200000,
        });
    }




    private convertToOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content
        }));
    }

    /**
     * Structured output implementation for Grok-4 using the official xAI API
     * Uses json_object mode with prompt augmentation for better compatibility
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            // Convert Zod schema to human-readable prompt description
            // This is more reliable than json_schema for some OpenAI-compatible endpoints
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);

            const preparedMessages = this.prepareMessages(messages);
            const openAIMessages = this.convertToOpenAIMessages(preparedMessages);

            // Add system instruction if needed
            if (openAIMessages.length > 0 && openAIMessages[0].role !== 'system') {
                openAIMessages.unshift({
                    role: 'system',
                    content: this.instruction
                });
            } else if (openAIMessages.length > 0 && openAIMessages[0].role === 'system') {
                openAIMessages[0].content = `${this.instruction}\n\n${openAIMessages[0].content}`;
            }

            // Add schema description to the last message to ensure the model follows it
            const lastMessage = openAIMessages[openAIMessages.length - 1];
            if (lastMessage) {
                lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
            }

            this.logAsking();
            this.logSystemPrompt();
            this.logMessages(messages);

            // Use json_object mode
            // Note: Grok 4.1 Fast Reasoning may have issues with json_object mode producing "[object Object]" responses.
            // We fallback to text mode for this specific model as a workaround.
            // Docs (https://docs.x.ai/docs/guides/structured-outputs) imply support for all models > grok-2-1212,
            // but practical experience shows otherwise for the Fast Reasoning variant.
            const isFastReasoning = this.model === 'grok-4-1-fast-reasoning';

            const completion = await this.client.chat.completions.create({
                model: this.model,
                temperature: this.temperature,
                messages: openAIMessages,
                response_format: isFastReasoning ? undefined : { type: "json_object" },
                max_tokens: 16384,  // Set to 16k to handle longer JSON responses
            });

            const reply = completion.choices[0]?.message?.content;
            if (!reply) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            this.logReply(reply);

            // Extract reasoning content if available
            const reasoningContent: string = (completion.choices[0]?.message as any)?.reasoning_content || "";

            this.logger(`Grok Agent - Found reasoning_content: ${!!reasoningContent}, length: ${reasoningContent.length}`);

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                const cleanedResponse = cleanResponse(reply);
                parsedContent = JSON.parse(cleanedResponse);
            } catch (parseError) {
                throw new Error(`Failed to parse JSON response: ${parseError}`);
            }

            // Validate using Zod schema
            const validationResult = safeValidateResponse(zodSchema, parsedContent);
            if (!validationResult.success) {
                this.logger(`Zod validation failed: ${JSON.stringify(validationResult.error.errors)}`);
                throw new Error(`Response validation failed: ${validationResult.error.message}`);
            }

            this.logger(`✅ Response validated successfully with Zod schema`);

            // Extract token usage information
            let tokenUsage: TokenUsage | undefined;
            if (completion.usage) {
                const cost = calculateGrokCost(
                    this.model,
                    completion.usage.prompt_tokens || 0,
                    completion.usage.completion_tokens || 0
                );

                tokenUsage = {
                    inputTokens: completion.usage.prompt_tokens || 0,
                    outputTokens: completion.usage.completion_tokens || 0,
                    totalTokens: completion.usage.total_tokens || 0,
                    costUSD: cost
                };

                // Log reasoning token breakdown if available and thinking is enabled
                if (this.enableThinking && (completion.usage as any).completion_tokens_details?.reasoning_tokens) {
                    const reasoningTokens = (completion.usage as any).completion_tokens_details.reasoning_tokens;
                    const finalAnswerTokens = tokenUsage.outputTokens - reasoningTokens;
                    this.logger(`Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`);
                }
            }

            return [validationResult.data, reasoningContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}