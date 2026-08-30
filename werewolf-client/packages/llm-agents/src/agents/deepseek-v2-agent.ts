import { AbstractAgent } from "./abstract-agent";
import { mergeThinking, stripInlineThinking } from "../thinking-utils";
import OpenAI from "openai";
import { AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "../types";
import { extractUsageAndCalculateCost } from "../pricing";
import { z } from 'zod';
import { ZodSchemaConverter } from '../zod-schema-converter';
import { parseAndValidateLlmJson } from '../json-response-parser';

export class DeepSeekV2Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
        switchingModel: (from: string, to: string) => `Switching from ${from} to ${to} for thinking mode`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from DeepSeek API',
        invalidFormat: 'Invalid response format from DeepSeek API',
        apiError: (error: unknown) =>
            `Failed to get response from DeepSeek API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(
        name: string, 
        instruction: string, 
        model: string, 
        apiKey: string, 
        temperature: number, 
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        super(name, instruction, model, temperature, enableThinking, agentLoggingConfig);
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
        });
    }



    private convertToOpenAIMessages(messages: AIMessage[]): Array<{ role: string, content: string }> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }

    private addSystemInstruction(messages: Array<{ role: string, content: string }>): Array<{ role: string, content: string }> {
        // Add system instruction if no system message exists
        if (messages.length === 0 || messages[0].role !== 'system') {
            return [
                { role: 'system', content: this.instruction },
                ...messages
            ];
        }

        // Prepend instruction to existing system message
        const updatedMessages = [...messages];
        updatedMessages[0] = {
            ...updatedMessages[0],
            content: `${this.instruction}\n\n${updatedMessages[0].content}`
        };

        return updatedMessages;
    }

    /**
     * Thinking params for the request body. DeepSeek V4 toggles thinking with a top-level
     * `thinking: { type }` (the docs' `extra_body` is a Python-SDK wrapper; openai-node has no
     * such thing and sends the key literally, where the API ignores it — probed 2026-08-30:
     * `extra_body: {thinking: {type: 'disabled'}}` still reasoned, top-level `thinking` did
     * not). Thinking is on by default, so the flag matters only for turning it off.
     * `reasoning_effort` takes low|high|max (default high, no budget parameter exists); it is
     * the instance field (catalog default, per-call override) and is only sent when set.
     */
    private thinkingParams(): Record<string, unknown> {
        if (!this.enableThinking) {
            return { thinking: { type: 'disabled' } };
        }
        const effort = this.reasoningEffort;
        return {
            thinking: { type: 'enabled' },
            ...(effort ? { reasoning_effort: effort } : {}),
        };
    }

    /**
     * New method using Zod with DeepSeek API
     * This provides better schema handling and runtime validation
     * 
     * DeepSeek V4 uses thinking toggle via extra_body. JSON mode (response_format
     * json_object) is supported with or without thinking, so we always request it.
     * Thinking additionally surfaces reasoning via reasoning_content.
     */
    async doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        try {
            const input = this.convertToOpenAIMessages(messages);

            this.logAsking(messages);
            this.logMessages(messages);

            // For reasoning models, add schema description to prompt
            // For non-reasoning models, use JSON schema format
            let modifiedInput = [...input];
            // Respect the model's configured output budget (resolved in AbstractAgent). An
            // 8192 cap used to truncate long replies mid-JSON on thinking models, where
            // reasoning_content shares this budget with the answer — hence the catalog
            // override on both DeepSeek entries.
            const requestParams: any = {
                model: this.model,
                messages: this.addSystemInstruction(modifiedInput),
                max_tokens: this.maxOutputTokens,
                ...(this.enableThinking ? {} : { temperature: this.temperature }),
            };

            // Add schema description to the last user message
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
            const lastMessage = modifiedInput[modifiedInput.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                modifiedInput[modifiedInput.length - 1] = {
                    ...lastMessage,
                    content: `${lastMessage.content}\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`
                };
                requestParams.messages = this.addSystemInstruction(modifiedInput);
            }

            // JSON mode is supported by both thinking and non-thinking models, so always
            // request it for structural enforcement. Thinking is an orthogonal toggle.
            requestParams.response_format = {
                type: 'json_object'
            };

            Object.assign(requestParams, this.thinkingParams());

            let response;
            try {
                response = await this.client.chat.completions.create(requestParams);
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            // Extract reasoning content if available (from thinking mode)
            let thinkingContent = "";
            if (this.enableThinking && response.choices[0]?.message) {
                const reasoning = (response.choices[0].message as any).reasoning_content;
                if (reasoning) {
                    thinkingContent = reasoning;
                }
            }

            const rawContent = response.choices[0]?.message?.content;
            if (!rawContent) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const { text: content, thinking: inlineThinking } = stripInlineThinking(rawContent);
            thinkingContent = mergeThinking(thinkingContent, inlineThinking);
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Parse and validate the response using the shared lenient parser
            const parsedData = parseAndValidateLlmJson(content, zodSchema, (m) => this.logger(m));

            this.logger(`✅ Response validated successfully with Zod schema`);

            // Extract token usage and calculate cost
            const usageResult = extractUsageAndCalculateCost(this.model, response);
            let tokenUsage: TokenUsage | undefined;

            if (usageResult) {
                tokenUsage = {
                    inputTokens: usageResult.usage.promptTokens,
                    outputTokens: usageResult.usage.completionTokens,
                    totalTokens: usageResult.usage.totalTokens,
                    costUSD: usageResult.cost,
                    ...(usageResult.usage.cacheHitTokens !== undefined ? { cachedInputTokens: usageResult.usage.cacheHitTokens } : {}),
                    // Omitted when absent so we never hand Firestore an undefined value.
                    ...(usageResult.usage.reasoningTokens ? { reasoningTokens: usageResult.usage.reasoningTokens } : {})
                };
            }

            if (parsedData) {
                this.logReply(parsedData, thinkingContent || undefined, tokenUsage);
            }

            return [parsedData, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Plain-text ask: same request structure as askWithZodSchema but without JSON mode
     * or a schema appended to the prompt. The raw response string is returned as-is.
     */
    async doAskText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        try {
            const input = this.convertToOpenAIMessages(messages);

            this.logAsking(messages);
            this.logMessages(messages);

            // Respect the model's configured output budget (resolved in AbstractAgent):
            // reasoning_content shares this budget with the answer on thinking models.
            const requestParams: any = {
                model: this.model,
                messages: this.addSystemInstruction(input),
                max_tokens: this.maxOutputTokens,
                ...(this.enableThinking ? {} : { temperature: this.temperature }),
            };

            Object.assign(requestParams, this.thinkingParams());

            let response;
            try {
                response = await this.client.chat.completions.create(requestParams);
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            // Extract reasoning content if available (from thinking mode)
            let thinkingContent = "";
            if (this.enableThinking && response.choices[0]?.message) {
                const reasoning = (response.choices[0].message as any).reasoning_content;
                if (reasoning) {
                    thinkingContent = reasoning;
                }
            }

            const rawContent = response.choices[0]?.message?.content;
            if (!rawContent) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const { text: content, thinking: inlineThinking } = stripInlineThinking(rawContent);
            thinkingContent = mergeThinking(thinkingContent, inlineThinking);
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Extract token usage and calculate cost
            const usageResult = extractUsageAndCalculateCost(this.model, response);
            let tokenUsage: TokenUsage | undefined;

            if (usageResult) {
                tokenUsage = {
                    inputTokens: usageResult.usage.promptTokens,
                    outputTokens: usageResult.usage.completionTokens,
                    totalTokens: usageResult.usage.totalTokens,
                    costUSD: usageResult.cost,
                    ...(usageResult.usage.cacheHitTokens !== undefined ? { cachedInputTokens: usageResult.usage.cacheHitTokens } : {}),
                    // Omitted when absent so we never hand Firestore an undefined value.
                    ...(usageResult.usage.reasoningTokens ? { reasoningTokens: usageResult.usage.reasoningTokens } : {})
                };
            }

            this.logReply(content, thinkingContent || undefined, tokenUsage);

            return [content, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}
