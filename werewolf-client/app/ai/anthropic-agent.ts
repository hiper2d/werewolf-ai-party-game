import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage, BotResponseError, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { Anthropic } from '@anthropic-ai/sdk';
import { calculateAnthropicCost } from "@/app/utils/pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';

type AnthropicRole = 'user' | 'assistant';

// Content block types for thinking-enabled messages
interface ThinkingBlock {
    type: 'thinking';
    thinking: string;
    signature?: string;  // Required for Claude 4+ multi-turn conversations
}

interface TextBlock {
    type: 'text';
    text: string;
}

type ContentBlock = ThinkingBlock | TextBlock;

interface AnthropicMessage {
    role: AnthropicRole;
    content: string | ContentBlock[];
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly maxTokens = 16384; // Set to 16k to handle longer JSON responses
    private readonly defaultParams: Omit<Anthropic.MessageCreateParams, 'messages'> = {
        max_tokens: this.maxTokens,
        system: this.instruction,
        model: this.model,
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


    constructor(
        name: string, 
        instruction: string, 
        model: string, 
        apiKey: string, 
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        super(name, instruction, model, 0.2, enableThinking, agentLoggingConfig);
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

    /**
     * Converts messages for thinking-enabled requests.
     * Assistant messages include thinking blocks ONLY if they have valid signatures.
     * If a signature is missing, the thinking block is dropped to ensure API validity.
     */
    private convertToAnthropicMessagesWithThinking(messages: AIMessage[]): AnthropicMessage[] {
        // Track thinking stats for aggregated logging
        let assistantMsgCount = 0;
        let withThinking = 0;
        let withValidAnthropicSig = 0;
        let droppedGoogleSig = 0;
        let droppedNoSig = 0;

        const result = messages.map(msg => {
            const role = this.convertRole(msg.role);

            if (role === 'assistant') {
                assistantMsgCount++;

                if (msg.thinking && msg.anthropicThinkingSignature) {
                    withThinking++;
                    withValidAnthropicSig++;
                    const thinkingBlock: ThinkingBlock = {
                        type: 'thinking',
                        thinking: msg.thinking,
                        signature: msg.anthropicThinkingSignature
                    };
                    const contentBlocks: ContentBlock[] = [
                        thinkingBlock,
                        { type: 'text', text: msg.content }
                    ];
                    return { role, content: contentBlocks };
                }

                // Track dropped thinking
                if (msg.thinking) {
                    withThinking++;
                    if (msg.googleThoughtSignature) {
                        droppedGoogleSig++;
                    } else {
                        droppedNoSig++;
                    }
                }

                // Fallback for text-only messages or messages with missing signatures
                return { role, content: msg.content };
            }

            // User messages remain as simple strings
            return { role, content: msg.content };
        });

        // Log aggregated thinking stats once
        if (withThinking > 0) {
            const dropped = droppedGoogleSig + droppedNoSig;
            let dropReason = '';
            if (droppedGoogleSig > 0) dropReason += `${droppedGoogleSig} with Google signature`;
            if (droppedNoSig > 0) dropReason += `${droppedNoSig > 0 && droppedGoogleSig > 0 ? ', ' : ''}${droppedNoSig} without signature`;

            this.logger(`📊 Thinking history: ${assistantMsgCount} assistant msgs, ${withThinking} with thinking, ` +
                `${withValidAnthropicSig} included, ${dropped} dropped${dropped > 0 ? ` (${dropReason})` : ''}`);
        }

        return result;
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
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        // Validate roles first, before entering the main try-catch block
        const aiMessages = this.prepareMessages(messages);

        this.logAsking(messages);
        this.logMessages(messages);

        try {
            // Generate human-readable schema description for Anthropic
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);

            // Add schema instructions to the last message
            const lastMessage = aiMessages[aiMessages.length - 1];
            const fullPrompt = `${lastMessage.content}\n\n${schemaDescription}`;

            // Update the last AI message with schema instructions before conversion
            const messagesWithSchema = [...aiMessages];
            messagesWithSchema[messagesWithSchema.length - 1] = {
                ...lastMessage,
                content: fullPrompt
            };

            // Use thinking if enabled for this agent
            const canUseThinking = this.enableThinking;

            // Convert messages - use thinking-aware conversion when thinking can be used
            const anthropicMessages = canUseThinking
                ? this.convertToAnthropicMessagesWithThinking(messagesWithSchema)
                : this.convertToAnthropicMessages(messagesWithSchema);

            const params: Anthropic.MessageCreateParams = {
                ...this.defaultParams,
                messages: anthropicMessages as Anthropic.MessageParam[],
            };

            // Add thinking config for Anthropic models with thinking mode.
            // Opus 4.8+ uses adaptive thinking and has deprecated the temperature param.
            const usesAdaptiveThinking = this.model.includes('opus');
            if (canUseThinking) {
                if (usesAdaptiveThinking) {
                    // Opus 4.8+ uses adaptive thinking with effort control
                    (params as any).thinking = { type: "adaptive" };
                    (params as any).output_config = { effort: "high" };
                } else {
                    // Sonnet 4.6, Haiku 4.5 use enabled thinking with budget
                    (params as any).thinking = { type: "enabled", budget_tokens: 1024 };
                    params.temperature = 1;
                }
                params.max_tokens = 16384;
            } else if (!usesAdaptiveThinking) {
                // Temperature is deprecated for Opus 4.8+
                params.temperature = this.temperature;
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
            let anthropicThinkingSignature = "";

            for (const block of response.content) {
                // Extract thinking content and signature
                if (this.enableThinking && (block as any).type === 'thinking' && 'thinking' in block) {
                    thinkingContent = (block as any).thinking;
                    // Extract signature if present (required for Claude 4+ multi-turn)
                    if ('signature' in block) {
                        anthropicThinkingSignature = (block as any).signature;
                    }
                }

                // Find the text content block
                if ('text' in block && !textContent) {
                    textContent = block.text;
                }
            }

            if (!textContent) {
                throw new Error(this.errorMessages.invalidFormat);
            }

            // Parse and validate the response using the shared lenient parser
            const parsedData = parseAndValidateLlmJson(textContent, zodSchema, (m) => this.logger(m));

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

            if (parsedData) {
                this.logReply(parsedData, thinkingContent || undefined, tokenUsage);
            }

            return [parsedData, thinkingContent, tokenUsage, anthropicThinkingSignature || undefined];

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

    /**
     * Plain-text ask: same request as askWithZodSchema but without a schema description
     * appended to the prompt and without JSON parsing. Thinking blocks and signatures
     * are extracted identically.
     */
    async askText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        const aiMessages = this.prepareMessages(messages);

        this.logAsking(messages);
        this.logMessages(messages);

        try {
            const canUseThinking = this.enableThinking;

            const anthropicMessages = canUseThinking
                ? this.convertToAnthropicMessagesWithThinking(aiMessages)
                : this.convertToAnthropicMessages(aiMessages);

            const params: Anthropic.MessageCreateParams = {
                ...this.defaultParams,
                messages: anthropicMessages as Anthropic.MessageParam[],
            };

            // Add thinking config for Anthropic models with thinking mode.
            // Opus 4.8+ uses adaptive thinking and has deprecated the temperature param.
            const usesAdaptiveThinking = this.model.includes('opus');
            if (canUseThinking) {
                if (usesAdaptiveThinking) {
                    (params as any).thinking = { type: "adaptive" };
                    (params as any).output_config = { effort: "high" };
                } else {
                    (params as any).thinking = { type: "enabled", budget_tokens: 1024 };
                    params.temperature = 1;
                }
                params.max_tokens = 16384;
            } else if (!usesAdaptiveThinking) {
                params.temperature = this.temperature;
            }

            let response;
            try {
                response = await this.client.messages.create(params);
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            if (!('content' in response) || !Array.isArray(response.content) || response.content.length === 0) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Extract thinking and concatenate all text blocks
            const textParts: string[] = [];
            let thinkingContent = "";
            let anthropicThinkingSignature = "";

            for (const block of response.content) {
                if (this.enableThinking && (block as any).type === 'thinking' && 'thinking' in block) {
                    thinkingContent = (block as any).thinking;
                    if ('signature' in block) {
                        anthropicThinkingSignature = (block as any).signature;
                    }
                }

                if ('text' in block) {
                    textParts.push(block.text);
                }
            }

            const textContent = textParts.join('');
            if (!textContent) {
                throw new Error(this.errorMessages.emptyResponse);
            }

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

                if (this.enableThinking && thinkingContent) {
                    this.logger(`Thinking enabled: ${thinkingContent.length} characters of thinking content`);
                    this.logger(`Note: Thinking tokens are included in output token count and cost`);
                }
            }

            this.logReply(textContent, thinkingContent || undefined, tokenUsage);

            return [textContent, thinkingContent, tokenUsage, anthropicThinkingSignature || undefined];

        } catch (error) {
            const errorDetails = error instanceof Error ? error.message : String(error);

            const isRecoverable = errorDetails.includes('overloaded_error') ||
                errorDetails.includes('529') ||
                errorDetails.includes('rate_limit');

            throw new BotResponseError(
                'Failed to get response from Anthropic API',
                errorDetails,
                {
                    model: this.model,
                    agentName: this.name,
                    apiProvider: 'Anthropic',
                    schemaType: 'text'
                },
                isRecoverable
            );
        }
    }
}
