import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage, BotResponseError, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { Anthropic } from '@anthropic-ai/sdk';
import { calculateAnthropicCost } from "@/app/utils/pricing";
import { getModelConfigByApiName } from "@/app/ai/ai-models";
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
    cache_control?: { type: 'ephemeral' };
}

type ContentBlock = ThinkingBlock | TextBlock;

interface AnthropicMessage {
    role: AnthropicRole;
    content: string | ContentBlock[];
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly maxTokens = 16384; // Set to 16k to handle longer JSON responses
    // System-prompt breakpoints, one per cache tier (see CACHE_TIER_MARKER):
    //   block 1 — shared static rules, byte-identical across all bots and games with the
    //             same rule set, so one org-level entry serves everyone and ANY bot's call
    //             refreshes its TTL;
    //   block 2 — per-bot identity + game state + summaries, byte-stable from the start of
    //             a game day through the end of its night (deaths/role knowledge/summaries
    //             only change in startNewDay), so every call within a day reads it.
    // GM prompts have no marker → single block, same behavior as before. Haiku 4.5 needs a
    // 4096-token cacheable prefix, so tiers below that silently no-op on Haiku — expected.
    private readonly defaultParams: Omit<Anthropic.MessageCreateParams, 'messages'> = {
        max_tokens: this.maxTokens,
        system: this.instructionParts.map(part => (
            { type: 'text' as const, text: part, cache_control: { type: 'ephemeral' as const } }
        )),
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



    /**
     * Unlike the base class, does NOT merge consecutive user messages: the Messages API
     * combines consecutive user turns into a single turn while preserving separate content
     * blocks, so the trailing reminder stays out of the persisted command block and the
     * fast cache breakpoint (see applyCacheBreakpoint) lands on bytes that repeat.
     */
    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
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

    /**
     * Breakpoint 2 (fast tier): the last message that will be re-sent byte-identically on
     * the next request. That is the SECOND-to-last message, not the last one — the final
     * user message carries unpersisted content (the reminder postfix / schema description)
     * appended to the GM command, so its bytes never repeat and a breakpoint there would be
     * a pure 1.25x write tax with no reads. The second-to-last message (the bot's previous
     * reply, or an earlier flushed block) reappears verbatim next turn, where the moved-
     * forward breakpoint finds it via the 20-block lookback.
     *
     * NOT the top-level auto-caching mode: that mode targets the LAST cacheable block,
     * which for us is exactly the never-repeated tail — every entry it wrote would be dead.
     */
    private applyCacheBreakpoint(messages: AnthropicMessage[]): void {
        if (messages.length < 2) {
            return; // one-shot call: system-prompt breakpoint still applies
        }
        const anchor = messages[messages.length - 2];
        if (typeof anchor.content === 'string') {
            if (anchor.content.length > 0) {
                anchor.content = [{ type: 'text', text: anchor.content, cache_control: { type: 'ephemeral' } }];
            }
            return;
        }
        // Thinking blocks are not cacheable — mark the last text block instead.
        for (let i = anchor.content.length - 1; i >= 0; i--) {
            const block = anchor.content[i];
            if (block.type === 'text' && block.text.length > 0) {
                block.cache_control = { type: 'ephemeral' };
                return;
            }
        }
    }

    /**
     * Builds TokenUsage from the response. Anthropic's input_tokens EXCLUDES cached tokens
     * (total prompt = input_tokens + cache_read + cache_creation), unlike the OpenAI-shaped
     * providers whose prompt_tokens include them — so reconstruct the full prompt size here
     * before pricing. Cache reads bill at the cacheHitPrice (~0.1x); cache writes bill at
     * 1.25x input, which MODEL_PRICING doesn't model, so written tokens are priced at the
     * plain input rate (~20% undercount on the written span only).
     */
    private buildTokenUsage(usage: Anthropic.Messages.Usage): TokenUsage {
        const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
        const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
        const uncachedInputTokens = usage.input_tokens || 0;
        const inputTokens = uncachedInputTokens + cacheReadTokens + cacheWriteTokens;
        const outputTokens = usage.output_tokens || 0;
        const cost = calculateAnthropicCost(this.model, inputTokens, outputTokens, cacheReadTokens);

        if (cacheReadTokens > 0 || cacheWriteTokens > 0) {
            this.logger(`💾 Prompt cache: ${cacheReadTokens} read, ${cacheWriteTokens} written, ${uncachedInputTokens} uncached`);
        }

        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            costUSD: cost
        };
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
            this.applyCacheBreakpoint(anthropicMessages);

            const params: Anthropic.MessageCreateParams = {
                ...this.defaultParams,
                messages: anthropicMessages as Anthropic.MessageParam[],
            };

            // Add thinking config for Anthropic models with thinking mode.
            // Fable 5, Opus 4.8 and Sonnet 5 use adaptive thinking and reject the temperature param
            // (and budget_tokens) — Haiku 4.5 still uses enabled thinking with a budget.
            // Fable 5's thinking is always on: it has no non-thinking variant and rejects
            // thinking:{type:"disabled"}, so it only ever hits the adaptive branch below.
            const usesAdaptiveThinking = this.model.includes('fable')
                || this.model.includes('opus') || this.model.includes('sonnet');
            if (canUseThinking) {
                const modelConfig = getModelConfigByApiName(this.model, this.enableThinking);
                if (usesAdaptiveThinking) {
                    // Fable 5 / Opus 4.8 / Sonnet 5: adaptive thinking with effort control.
                    // display: "summarized" is required to surface the reasoning — these models
                    // default to "omitted", which returns thinking blocks with an empty field.
                    (params as any).thinking = { type: "adaptive", display: "summarized" };
                    (params as any).output_config = { effort: modelConfig?.reasoningEffort ?? "high" };
                } else {
                    // Haiku 4.5 uses enabled thinking with budget
                    (params as any).thinking = { type: "enabled", budget_tokens: modelConfig?.thinkingBudgetTokens ?? 1024 };
                    params.temperature = 1;
                }
                params.max_tokens = 16384;
            } else if (usesAdaptiveThinking) {
                // Opus 4.8 / Sonnet 5 reject a non-default temperature. Sonnet 5 also defaults to
                // adaptive thinking when `thinking` is omitted, so disable it explicitly to keep the
                // non-thinking variant from reasoning (avoiding extra thinking cost and latency).
                (params as any).thinking = { type: "disabled" };
            } else {
                // Older models (Haiku 4.5): no adaptive thinking; pass the configured temperature.
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
                tokenUsage = this.buildTokenUsage(response.usage);

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
            this.applyCacheBreakpoint(anthropicMessages);

            const params: Anthropic.MessageCreateParams = {
                ...this.defaultParams,
                messages: anthropicMessages as Anthropic.MessageParam[],
            };

            // Add thinking config for Anthropic models with thinking mode.
            // Fable 5, Opus 4.8 and Sonnet 5 use adaptive thinking and have deprecated the temperature
            // param (and budget_tokens). Fable 5's thinking is always on: it rejects
            // thinking:{type:"disabled"}, so it only ever hits the adaptive branch below.
            const usesAdaptiveThinking = this.model.includes('fable')
                || this.model.includes('opus') || this.model.includes('sonnet');
            if (canUseThinking) {
                const modelConfig = getModelConfigByApiName(this.model, this.enableThinking);
                if (usesAdaptiveThinking) {
                    (params as any).thinking = { type: "adaptive", display: "summarized" };
                    (params as any).output_config = { effort: modelConfig?.reasoningEffort ?? "high" };
                } else {
                    (params as any).thinking = { type: "enabled", budget_tokens: modelConfig?.thinkingBudgetTokens ?? 1024 };
                    params.temperature = 1;
                }
                params.max_tokens = 16384;
            } else if (usesAdaptiveThinking) {
                // Opus 4.8 / Sonnet 5 reject a non-default temperature and default to adaptive
                // thinking when `thinking` is omitted; disable it explicitly for the non-thinking variant.
                (params as any).thinking = { type: "disabled" };
            } else {
                // Older models (Haiku 4.5): no adaptive thinking; pass the configured temperature.
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
                tokenUsage = this.buildTokenUsage(response.usage);

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
