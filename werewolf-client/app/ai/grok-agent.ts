import { AbstractAgent } from "@/app/ai/abstract-agent";
import { OpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { AIMessage, TokenUsage } from "@/app/api/game-models";
import { cleanResponse } from "@/app/utils/message-utils";
import { calculateGrokCost } from "@/app/utils/pricing";
import { z } from 'zod';

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

        return [cleanResponse(reply), reasoningContent, tokenUsage];
    }

    /**
     * Structured output implementation for Grok-4 using the official xAI API
     * Uses client.chat.completions.parse() with zodResponseFormat
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            const preparedMessages = this.prepareMessages(messages);
            const openAIMessages = this.convertToOpenAIMessages(preparedMessages);

            // Add system instruction if needed
            if (openAIMessages.length > 0 && openAIMessages[0].role !== 'system') {
                openAIMessages.unshift({
                    role: 'system',
                    content: this.instruction
                });
            } else if (openAIMessages.length > 0 && openAIMessages[0].role === 'system') {
                openAIMessages[0].content = `${this.instruction}\\n\\n${openAIMessages[0].content}`;
            }

            this.logAsking();
            this.logSystemPrompt();
            this.logMessages(messages);

            // Use the official structured output API for grok-4
            // Note: Grok-4 needs high max_tokens because it consumes many tokens for reasoning
            const completion = await this.client.chat.completions.parse({
                model: this.model,
                temperature: this.temperature,
                messages: openAIMessages,
                response_format: zodResponseFormat(zodSchema, "response"),
                max_tokens: 16384  // Set to 16k to handle longer JSON responses
            });

            // Get the parsed structured response
            const parsedData = completion.choices[0]?.message?.parsed;
            if (!parsedData) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Extract reasoning content if available (grok-4 reasoning)
            const reasoningContent: string = (completion.choices[0]?.message as any)?.reasoning_content || "";

            this.logger(`Grok Agent - Found reasoning_content: ${!!reasoningContent}, length: ${reasoningContent.length}`);
            this.logger(`✅ Response parsed successfully with Zod schema`);

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

            return [parsedData, reasoningContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}