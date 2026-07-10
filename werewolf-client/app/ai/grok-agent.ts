import {AbstractAgent} from "@/app/ai/abstract-agent";
import {OpenAI} from "openai";
import {AIMessage, TokenUsage, AgentLoggingConfig, DEFAULT_LOGGING_CONFIG} from "@/app/api/game-models";
import {parseAndValidateLlmJson} from './json-response-parser';
import {calculateGrokCost} from "@/app/utils/pricing";
import {z} from 'zod';
import {ZodSchemaConverter} from './zod-schema-converter';

/**
 * xAI Grok agent on the Responses API.
 *
 * grok-4.5 is an always-on reasoning model; we do not send `reasoning_effort` and use the
 * xAI default ("high"). Reasoning cannot be disabled. Each response's encrypted reasoning
 * items (requested via `include: ["reasoning.encrypted_content"]`) are returned as the 4th
 * tuple element, stored on the game message as `grokEncryptedReasoning`, and replayed into
 * `input` on later turns so the model keeps its chain-of-thought across the conversation.
 */
export class GrokAgent extends AbstractAgent {
    private readonly client: OpenAI;

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
            apiKey: apiKey,
            baseURL: 'https://api.x.ai/v1',
            timeout: 1200000,
        });
    }

    /**
     * Structured output implementation for Grok using json_object mode with prompt
     * augmentation — more reliable than json_schema on OpenAI-compatible endpoints.
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        try {
            const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
            const input = this.buildResponsesInput(this.prepareMessages(messages));

            // Add schema description to the last message to ensure the model follows it
            const lastMessage = input[input.length - 1];
            if (lastMessage && typeof lastMessage.content === 'string') {
                lastMessage.content += `\n\nYour response must be a valid JSON object matching this schema:\n${schemaDescription}`;
            }

            this.logAsking(messages);
            this.logMessages(messages);

            const response = await this.createResponse(input, true);
            const { text, reasoningSummary, encryptedReasoning } = this.extractResponseParts(response);
            if (!text) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            this.logger(`Grok Agent - Found reasoning summary: ${!!reasoningSummary}, encrypted reasoning: ${!!encryptedReasoning}`);

            // Parse and validate the response using the shared lenient parser
            const parsedData = parseAndValidateLlmJson(text, zodSchema, (m) => this.logger(m));

            this.logger(`✅ Response validated successfully with Zod schema`);

            const tokenUsage = this.extractTokenUsage(response);

            if (parsedData) {
                this.logReply(parsedData, reasoningSummary, tokenUsage);
            }

            return [parsedData, reasoningSummary, tokenUsage, encryptedReasoning];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Plain-text ask: no JSON mode and no schema appended to the prompt.
     * Reasoning extraction and token accounting are identical to askWithZodSchema.
     */
    async askText(messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        try {
            const input = this.buildResponsesInput(this.prepareMessages(messages));

            this.logAsking(messages);
            this.logMessages(messages);

            const response = await this.createResponse(input, false);
            const { text, reasoningSummary, encryptedReasoning } = this.extractResponseParts(response);
            if (!text) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            const tokenUsage = this.extractTokenUsage(response);

            this.logReply(text, reasoningSummary, tokenUsage);

            return [text, reasoningSummary, tokenUsage, encryptedReasoning];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private createResponse(input: any[], jsonMode: boolean): Promise<any> {
        return this.client.responses.create({
            model: this.model,
            temperature: this.temperature,
            input,
            // Reasoning bills against the output budget on top of the visible answer,
            // so this is larger than the old chat-completions max_tokens of 16384.
            max_output_tokens: 32768,
            // We manage conversation state ourselves; encrypted reasoning is only
            // returned for unstored responses.
            store: false,
            include: ["reasoning.encrypted_content"],
            ...(jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
        } as any);
    }

    /**
     * Converts game history to Responses API input items. The system instruction is
     * merged into the leading system message; assistant messages carrying stored
     * encrypted reasoning get their reasoning items replayed right before them.
     */
    private buildResponsesInput(messages: AIMessage[]): any[] {
        const input: any[] = [];

        for (const msg of messages) {
            if (msg.role === 'assistant' && msg.grokEncryptedReasoning) {
                try {
                    const reasoningItems = JSON.parse(msg.grokEncryptedReasoning);
                    if (Array.isArray(reasoningItems)) {
                        input.push(...reasoningItems);
                    }
                } catch {
                    this.logger(`Failed to parse stored encrypted reasoning, replaying message without it`);
                }
            }
            input.push({ role: msg.role, content: msg.content });
        }

        if (input.length > 0 && input[0].role !== 'system') {
            input.unshift({ role: 'system', content: this.instruction });
        } else if (input.length > 0 && input[0].role === 'system') {
            input[0].content = `${this.instruction}\n\n${input[0].content}`;
        }

        return input;
    }

    /**
     * Walks the response output items: reasoning items yield the human-readable summary
     * plus the encrypted items (serialized for storage/replay); message items yield text.
     */
    private extractResponseParts(response: any): { text: string; reasoningSummary: string; encryptedReasoning?: string } {
        const textParts: string[] = [];
        const summaryParts: string[] = [];
        const encryptedItems: any[] = [];

        for (const item of response?.output ?? []) {
            if (!item) {
                continue;
            }
            if (item.type === 'reasoning') {
                for (const summary of item.summary ?? []) {
                    if (typeof summary?.text === 'string' && summary.text) {
                        summaryParts.push(summary.text);
                    }
                }
                if (item.encrypted_content) {
                    encryptedItems.push(item);
                }
            } else if (item.type === 'message') {
                for (const part of item.content ?? []) {
                    if (part?.type === 'output_text' && typeof part.text === 'string') {
                        textParts.push(part.text);
                    }
                }
            }
        }

        return {
            text: textParts.join('\n').trim(),
            reasoningSummary: summaryParts.join('\n').trim(),
            encryptedReasoning: encryptedItems.length > 0 ? JSON.stringify(encryptedItems) : undefined,
        };
    }

    private extractTokenUsage(response: any): TokenUsage | undefined {
        const usage = response?.usage;
        if (!usage) {
            return undefined;
        }

        const inputTokens = usage.input_tokens || 0;
        // Responses API output_tokens already includes reasoning tokens
        const outputTokens = usage.output_tokens || 0;
        const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;
        const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;

        const cost = calculateGrokCost(this.model, inputTokens, outputTokens, cachedTokens);

        if (reasoningTokens > 0) {
            this.logger(`Output breakdown: ${reasoningTokens} reasoning tokens, ${outputTokens - reasoningTokens} final answer tokens, ${outputTokens} total output tokens`);
        }
        if (cachedTokens > 0) {
            this.logger(`Input breakdown: ${cachedTokens} cached tokens of ${inputTokens} input tokens`);
        }

        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            costUSD: cost
        };
    }
}
