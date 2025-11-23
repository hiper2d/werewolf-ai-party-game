import { AbstractAgent } from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import { AIMessage, TokenUsage } from "@/app/api/game-models";
import { calculateOpenAICost } from "@/app/utils/pricing";
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

export class Gpt5Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from OpenAI API',
        invalidFormat: 'Invalid response format from OpenAI API',
        apiError: (error: unknown) =>
            `Failed to get response from OpenAI API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(name: string, instruction: string, model: string, apiKey: string, temperature: number, enableThinking: boolean = false) {
        super(name, instruction, model, temperature, enableThinking);
        this.client = new OpenAI({
            apiKey: apiKey,
        });
    }


    /**
     * Structured output method using Zod with OpenAI's Responses API
     * This provides better schema handling and runtime validation
     * 
     * Uses responses.parse for models that support structured outputs
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        try {
            this.logAsking();
            this.logSystemPrompt();
            this.logMessages(messages);

            // Combine system instruction with messages for the input
            const input = [
                `System: ${this.instruction}`,
                ...messages.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            ].join('\n\n');

            const response = await this.client.responses.parse({
                model: this.model,
                instructions: this.instruction,
                input: input,
                max_output_tokens: 16384,  // Set to 16k to handle longer JSON responses
                text: {
                    format: zodTextFormat(zodSchema, "response_schema"),
                }
            });

            if (!response.output_parsed) {
                this.logger(`Parsing failed. Raw content: ${response.output_text}`);
                throw new Error(this.errorMessages.invalidFormat);
            }

            this.logger(`✅ Response validated successfully with Zod schema`);

            // Extract reasoning content from output if available
            const reasoningContent = response.output_text || "";

            // Extract token usage
            let tokenUsage: TokenUsage | undefined;
            if (response.usage) {
                const cost = calculateOpenAICost(
                    this.model,
                    response.usage.input_tokens,
                    response.usage.output_tokens
                );

                tokenUsage = {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                    totalTokens: response.usage.total_tokens || 0,
                    costUSD: cost
                };

                // Log reasoning token breakdown if available
                if (response.usage.output_tokens_details?.reasoning_tokens) {
                    const reasoningTokens = response.usage.output_tokens_details.reasoning_tokens;
                    const finalAnswerTokens = tokenUsage.outputTokens - reasoningTokens;
                    this.logger(`Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`);
                }
            }

            return [response.output_parsed, reasoningContent, tokenUsage];
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

}