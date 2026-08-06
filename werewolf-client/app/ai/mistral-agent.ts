import { AbstractAgent } from "@/app/ai/abstract-agent";
import { createHash } from "crypto";
import { Mistral } from "@mistralai/mistralai";
import { HTTPClient } from "@mistralai/mistralai/lib/http";
import { ChatCompletionResponse } from "@mistralai/mistralai/models/components";
import { AIMessage, MESSAGE_ROLE, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG } from "@/app/api/game-models";
import { cleanResponse } from "@/app/utils/message-utils";
import { z } from 'zod';
import { ZodSchemaConverter } from './zod-schema-converter';
import { parseAndValidateLlmJson } from './json-response-parser';
import { extractMistralTokenUsage, calculateCost } from '@/app/utils/pricing/token-usage-utils';

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly defaultParams: Omit<Parameters<Mistral['chat']['complete']>[0], 'messages'> = {
        model: this.model,
        maxTokens: 16384,  // Set to 16k to handle longer JSON responses
        temperature: this.temperature,
    };

    // Log message templates
    private readonly logTemplates = {
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Mistral API',
        invalidFormat: 'Invalid response format from Mistral API',
        apiError: (error: unknown) =>
            `Failed to get response from Mistral API: ${error instanceof Error ? error.message : String(error)}`,
    };


    constructor(
        name: string, 
        instruction: string, 
        model: string, 
        apiKey: string, 
        enableThinking: boolean = false,
        agentLoggingConfig: AgentLoggingConfig = DEFAULT_LOGGING_CONFIG.agents
    ) {
        super(name, instruction, model, 0.7, enableThinking, agentLoggingConfig);

        // Mistral's cache hint is the `prompt_cache_key` request param ("use the same key
        // for requests with shared prompt prefixes ... to increase cache hits"), but SDK
        // 1.10.0 has no typed field for it and its outbound zod schema strips unknown keys.
        // Inject it via the SDK's beforeRequest hook instead. The key is derived from bot
        // identity + system prompt, so it is stable within a game day. Any failure falls
        // back to sending the request untouched.
        const promptCacheKey = createHash('sha256').update(`${name}\n${instruction}`).digest('hex');
        const httpClient = new HTTPClient();
        httpClient.addHook("beforeRequest", async (request) => {
            try {
                if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/chat/completions')) {
                    const body = await request.clone().text();
                    const json = JSON.parse(body);
                    json.prompt_cache_key = promptCacheKey;
                    return new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: JSON.stringify(json),
                    });
                }
            } catch {
                // fall through to the original request
            }
            return request;
        });
        this.client = new Mistral({ apiKey: apiKey, httpClient });

        // Note: Magistral reasoning models can generate thinking content, but only when
        // responseFormat is not set to 'json_object'. Since this game requires JSON responses,
        // thinking content will be suppressed. The models still benefit from internal reasoning
        // during generation, but thinking traces are not returned in the response.
    }



    private convertToMistralMessages(messages: AIMessage[]) {
        return this.prepareMessages(messages).map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role,
            content: msg.content
        }));
    }


    private processReply(response: ChatCompletionResponse | undefined): [string, string, TokenUsage?] {
        const message = response?.choices?.[0]?.message;

        if (!message || !message.content) {
            throw new Error(this.errorMessages.emptyResponse);
        }

        let reply = message.content;

        // Handle structured content (thinking models)
        if (Array.isArray(reply)) {
            const { content, thinking } = this.processStructuredReply(reply);

            // Log thinking information if available
            if (this.enableThinking && thinking) {
                this.logger(`Thinking content: ${thinking.length} characters of reasoning`);
            }

            return [cleanResponse(content), thinking, this.extractTokenUsage(response)];
        }

        // Handle string content (regular models)
        return [cleanResponse(reply), "", this.extractTokenUsage(response)];
    }

    private processStructuredReply(reply: unknown[]): { content: string; thinking: string } {
        let content = "";
        let thinking = "";

        // Response should have 2 parts: thinking block and text block
        for (const chunk of reply) {
            if (typeof chunk === "object" && chunk !== null && "type" in chunk) {
                if (chunk.type === "thinking" && "thinking" in chunk) {
                    // Extract thinking content from the thinking block
                    const thinkingArray = chunk.thinking as any[];
                    thinking = thinkingArray
                        .filter((item: any) => item?.type === "text" && item?.text)
                        .map((item: any) => item.text)
                        .join("");
                } else if (chunk.type === "text" && "text" in chunk) {
                    // Extract the final answer from the text block
                    content = chunk.text as string;
                }
            }
        }

        return { content, thinking };
    }

    private extractTokenUsage(response: ChatCompletionResponse | undefined): TokenUsage | undefined {
        // Use the centralized Mistral token usage extraction
        const usage = extractMistralTokenUsage(response);
        if (!usage) return undefined;

        // MISTRAL_CACHE_CALIBRATION: Mistral documents cached billing but no usage field for
        // hits; the SDK parks unknown wire fields in usage.additionalProperties. Log the raw
        // usage until one real game answers whether hits are reported at all, then remove.
        this.logger(`MISTRAL_CACHE_CALIBRATION raw usage: ${JSON.stringify(response?.usage)}`);

        // Log reasoning tokens if available (Magistral models)
        if (usage.reasoningTokens && usage.reasoningTokens > 0) {
            this.logger(`🧠 Reasoning tokens used: ${usage.reasoningTokens}`);
        }

        if (usage.cacheHitTokens && usage.cacheHitTokens > 0) {
            this.logger(`💾 Prompt cache: ${usage.cacheHitTokens} of ${usage.promptTokens} input tokens served from cache`);
        }

        // Calculate cost using centralized pricing from ai-models.ts
        const costUSD = calculateCost(this.model, usage.promptTokens, usage.completionTokens, {
            totalTokens: usage.totalTokens,
            cacheHitTokens: usage.cacheHitTokens || 0
        });

        return {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            costUSD,
            // Omitted when absent so we never hand Firestore an undefined value.
            ...(usage.reasoningTokens ? { reasoningTokens: usage.reasoningTokens } : {}),
            ...(usage.cacheHitTokens ? { cachedInputTokens: usage.cacheHitTokens } : {})
        };
    }

    /**
     * New method using Zod with Mistral API
     * This provides better schema handling and runtime validation
     *
     * Uses Mistral Custom Structured Outputs (responseFormat json_schema), which
     * enforces the response shape server-side and is more reliable than plain JSON
     * mode. The human-readable schema description is still appended to the last
     * message because the enforced schema omits field descriptions/semantics.
     */
    async doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        try {
            // Convert Zod schema to human-readable prompt description
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);

            // Convert messages to Mistral format and add schema to last message
            const convertedMessages = this.convertToMistralMessages(messages);

            // Add schema description to the last message content
            if (convertedMessages.length > 0) {
                const lastMessage = convertedMessages[convertedMessages.length - 1];
                if (lastMessage && lastMessage.content) {
                    lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
                }
            } else {
                // If no messages, create a default user message with schema
                convertedMessages.push({
                    role: 'user',
                    content: `Please respond with a valid JSON object matching this schema:\n${schemaDescription}`
                });
            }

            // Prepare system message
            const systemMessage = {
                role: MESSAGE_ROLE.SYSTEM,
                content: this.instruction
            };

            const allMessages = [systemMessage, ...convertedMessages];

            // Build request parameters using Mistral Custom Structured Outputs.
            // json_schema enforces the response shape server-side; parseAndValidateLlmJson
            // below remains as a backstop for the rare case the model still drifts.
            const requestParams = {
                ...this.defaultParams,
                messages: allMessages,
                responseFormat: {
                    type: 'json_schema' as const,
                    jsonSchema: {
                        name: 'response_schema',
                        schemaDefinition: ZodSchemaConverter.toMistralSchema(zodSchema),
                        strict: true
                    }
                }
            };

            this.logAsking(messages);
            this.logMessages(messages);

            let response;
            try {
                response = await this.client.chat.complete(requestParams);
            } catch (apiError) {
                // Re-throw API errors immediately without wrapping them in schema validation errors
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const choice = response.choices[0];
            const content = choice.message?.content;

            if (!content) {
                throw new Error(this.errorMessages.invalidFormat);
            }

            // Extract text content from structured responses (thinking models return arrays)
            let responseText: string;
            let thinkingContent = "";

            if (Array.isArray(content)) {
                // Handle structured content (thinking models)
                const { content: extractedContent, thinking } = this.processStructuredReply(content);
                responseText = extractedContent;
                thinkingContent = thinking;
            } else if (typeof content === 'string') {
                responseText = content;
            } else {
                // Fallback for unexpected content types
                responseText = JSON.stringify(content);
            }

            // Parse and validate the response using the shared lenient parser
            // (handles Mistral's nested-reply-object quirk internally)
            const parsedData = parseAndValidateLlmJson(responseText, zodSchema, (m) => this.logger(m));

            this.logger(`✅ Response validated successfully with Zod schema`);

            // Extract token usage
            const tokenUsage = this.extractTokenUsage(response);

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
     * Plain-text ask: no schema appended, no responseFormat. Note that Magistral
     * reasoning models only return thinking traces when responseFormat is NOT
     * json_object, so unlike askWithZodSchema this path can surface thinking content.
     */
    async doAskText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        try {
            const convertedMessages = this.convertToMistralMessages(messages);

            const systemMessage = {
                role: MESSAGE_ROLE.SYSTEM,
                content: this.instruction
            };

            const requestParams = {
                ...this.defaultParams,
                messages: [systemMessage, ...convertedMessages],
            };

            this.logAsking(messages);
            this.logMessages(messages);

            let response;
            try {
                response = await this.client.chat.complete(requestParams);
            } catch (apiError) {
                this.logger(this.logTemplates.error(this.name, apiError));
                throw new Error(this.errorMessages.apiError(apiError));
            }

            // processReply throws on empty content and handles structured (thinking) replies
            const [content, thinkingContent, tokenUsage] = this.processReply(response);

            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            this.logReply(content, thinkingContent || undefined, tokenUsage);

            return [content, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }
}