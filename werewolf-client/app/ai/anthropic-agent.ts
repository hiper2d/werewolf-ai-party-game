import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage, BotResponseError, TokenUsage } from "@/app/api/game-models";
import { Anthropic } from '@anthropic-ai/sdk';
import { cleanResponse } from "@/app/utils/message-utils";
import { calculateAnthropicCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { safeValidateResponse } from './prompts/zod-schemas';

type AnthropicRole = 'user' | 'assistant';

interface AnthropicMessage {
    role: AnthropicRole;
    content: string;
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly maxTokens = 16384; // Set to 16k to handle longer JSON responses
    private readonly defaultParams: Omit<Anthropic.MessageCreateParams, 'messages'> = {
        max_tokens: this.maxTokens,
        system: this.instruction,
        model: this.model,
        temperature: this.temperature,
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty response from Anthropic API',
        invalidFormat: 'Invalid response format from Anthropic API',
        apiError: (error: unknown) =>
            `Failed to get response from Anthropic API: ${error instanceof Error ? error.message : String(error)}`,
        unsupportedRole: (role: string) => `Unsupported role type: ${role}`,
    };


    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.2, enableThinking);
        this.client = new Anthropic({
            apiKey: apiKey,
        });
    }



    private convertToAnthropicMessages(messages: AIMessage[]): AnthropicMessage[] {
        return messages.map(msg => ({
            role: this.convertRole(msg.role),
            content: msg.content
        }));
    }

    private convertRole(role: string): AnthropicRole {
        if (role === 'system' || role === 'user') {
            return 'user';
        }
        if (role === 'assistant') {
            return 'assistant';
        }
        throw new Error(this.errorMessages.unsupportedRole(role));
    }

    /**
     * New method using Zod with Anthropic's Claude API
     * Since Anthropic doesn't support native JSON schemas, we generate prompt descriptions
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?]> {
        // Validate roles first, before entering the main try-catch block
        // This ensures role validation errors are thrown directly
        const aiMessages = this.prepareMessages(messages);
        const anthropicMessages = this.convertToAnthropicMessages(aiMessages);

        this.logAsking();
        this.logSystemPrompt();
        this.logMessages(messages);

        try {
            // Generate human-readable schema description for Anthropic
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);

            // Add schema instructions to the last message
            const lastMessage = aiMessages[aiMessages.length - 1];
            const fullPrompt = `${lastMessage.content}\n\n${schemaDescription}`;
            const updatedMessages = [...anthropicMessages];
            updatedMessages[updatedMessages.length - 1] = {
                ...updatedMessages[updatedMessages.length - 1],
                content: fullPrompt
            };

            const params: Anthropic.MessageCreateParams = {
                ...this.defaultParams,
                messages: updatedMessages,
            };

            // Add thinking config for Anthropic models with thinking mode
            if (this.enableThinking) {
                (params as any).thinking = {
                    type: "enabled",
                    budget_tokens: 1024
                };
                // Anthropic requires temperature to be 1 when thinking is enabled
                params.temperature = 1;
                // Increase max_tokens to be greater than budget_tokens
                // Use a larger value for complex responses like game generation
                params.max_tokens = 16384; // Set to 16k
            }

            let response;
            try {
                response = await this.client.messages.create(params);
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            if (!('content' in response) || !Array.isArray(response.content) || response.content.length === 0) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Handle thinking content if present and find text content
            let textContent = null;
            let thinkingContent = "";

            for (const block of response.content) {
                // Extract thinking content
                if (this.enableThinking && (block as any).type === 'thinking' && 'thinking' in block) {
                    thinkingContent = (block as any).thinking;
                }

                // Find the text content block
                if ('text' in block && !textContent) {
                    textContent = block.text;
                }
            }

            if (!textContent) {
                throw new Error(this.errorMessages.invalidFormat);
            }

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                const cleanedResponse = cleanResponse(textContent);
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
            if (response.usage) {
                const cost = calculateAnthropicCost(
                    this.model,
                    response.usage.input_tokens || 0,
                    response.usage.output_tokens || 0
                );

                tokenUsage = {
                    inputTokens: response.usage.input_tokens || 0,
                    outputTokens: response.usage.output_tokens || 0,
                    totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
                    costUSD: cost
                };

                // Log thinking information if available
                if (this.enableThinking && thinkingContent) {
                    this.logger(`Thinking enabled: ${thinkingContent.length} characters of thinking content`);
                    this.logger(`Note: Thinking tokens are included in output token count and cost`);
                }
            }

            return [validationResult.data, thinkingContent, tokenUsage];

        } catch (error) {
            const errorDetails = error instanceof Error ? error.message : String(error);

            // Check if this is an API overload error (529) which is recoverable
            const isRecoverable = errorDetails.includes('overloaded_error') ||
                errorDetails.includes('529') ||
                errorDetails.includes('rate_limit');

            throw new BotResponseError(
                'Failed to get response from Anthropic API with Zod schema',
                errorDetails,
                {
                    model: this.model,
                    agentName: this.name,
                    apiProvider: 'Anthropic',
                    schemaType: 'zod'
                },
                isRecoverable
            );
        }
    }
}
