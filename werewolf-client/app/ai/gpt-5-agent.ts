import {AbstractAgent} from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {calculateOpenAICost} from "@/app/utils/pricing";
import { z } from 'zod';
import { validateResponse, safeValidateResponse } from "@/app/ai/prompts/zod-schemas";

export class Gpt5Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from OpenAI API',
        invalidFormat: 'Invalid response format from OpenAI API',
        apiError: (error: unknown) =>
            `Failed to get response from OpenAI API: ${error instanceof Error ? error.message : String(error)}`,
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
        });
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        try {
            const input = this.convertToOpenAIInput(messages);

            const strictSchema = this.makeSchemaStrict(schema);

            const requestParams: any = {
                model: this.model,
                input: input,
                instructions: this.instruction,
                text: {
                    verbosity: "low",
                    format: {
                        type: "json_schema",
                        strict: true,
                        name: "response_schema",
                        schema: strictSchema
                    }
                }
            };

            if (this.enableThinking) {
                requestParams.reasoning = {
                    effort: "low",
                    summary: "auto"
                };
            }

            const response = await this.client.responses.create(requestParams);

            // Extract token usage information
            let tokenUsage: TokenUsage | undefined;
            if (response.usage) {
                const cost = calculateOpenAICost(
                    this.model,
                    response.usage.input_tokens || 0,
                    response.usage.output_tokens || 0
                );
                
                tokenUsage = {
                    inputTokens: response.usage.input_tokens || 0,
                    outputTokens: response.usage.output_tokens || 0,
                    totalTokens: response.usage.total_tokens || 0,
                    costUSD: cost
                };
            }

            // Extract reasoning content if available (for reasoning models)
            let thinkingContent = "";
            if (this.enableThinking) {
                const responseWithOutput = response as any;
                if (responseWithOutput.output && Array.isArray(responseWithOutput.output)) {
                    const reasoningItem = responseWithOutput.output.find((item: any) => item.type === 'reasoning');
                    if (reasoningItem?.summary && Array.isArray(reasoningItem.summary)) {
                        const summaryTexts = reasoningItem.summary
                            .filter((s: any) => s.type === 'summary_text')
                            .map((s: any) => s.text);
                        thinkingContent = summaryTexts.join('\n');
                    }
                }
            }

            // Log reasoning token breakdown if available and thinking is enabled
            if (this.enableThinking && tokenUsage && response.usage?.output_tokens_details?.reasoning_tokens) {
                const reasoningTokens = response.usage.output_tokens_details.reasoning_tokens;
                const finalAnswerTokens = tokenUsage.outputTokens - reasoningTokens;
                this.logger(`Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`);
            }

            // For responses API, the content is in output_text
            const content = response.output_text;
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            return [cleanResponse(content), thinkingContent, tokenUsage];
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Recursively processes a JSON schema to make it strict for OpenAI API
     * Adds additionalProperties: false to all object types
     */
    private makeSchemaStrict(schema: any): any {
        if (typeof schema !== 'object' || schema === null) {
            return schema;
        }

        const result = { ...schema };

        // Add additionalProperties: false for object types
        if (result.type === 'object') {
            result.additionalProperties = false;
        }

        // Recursively process properties
        if (result.properties) {
            result.properties = Object.fromEntries(
                Object.entries(result.properties).map(([key, prop]: [string, any]) => [
                    key,
                    this.makeSchemaStrict(prop)
                ])
            );
        }

        // Recursively process array items
        if (result.items) {
            result.items = this.makeSchemaStrict(result.items);
        }

        // Recursively process oneOf, anyOf, allOf
        if (result.oneOf) {
            result.oneOf = result.oneOf.map((subSchema: any) => this.makeSchemaStrict(subSchema));
        }
        if (result.anyOf) {
            result.anyOf = result.anyOf.map((subSchema: any) => this.makeSchemaStrict(subSchema));
        }
        if (result.allOf) {
            result.allOf = result.allOf.map((subSchema: any) => this.makeSchemaStrict(subSchema));
        }

        return result;
    }

    /**
     * New method using Zod with OpenAI's Chat Completions API
     * This provides better schema handling and runtime validation
     */
    async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[], schemaName: string): Promise<[T, string, TokenUsage?]> {
        try {
            const chatMessages = this.convertToChatMessages(messages);
            
            const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: this.instruction
                    },
                    ...chatMessages
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: schemaName,
                        schema: this.zodToOpenAISchema(zodSchema),
                        strict: true
                    }
                }
            };

            // Add reasoning config if thinking is enabled
            if (this.enableThinking) {
                (requestParams as any).reasoning = {
                    effort: "medium"
                };
            }

            const response = await this.client.chat.completions.create(requestParams);

            // Extract token usage
            let tokenUsage: TokenUsage | undefined;
            if (response.usage) {
                const cost = calculateOpenAICost(
                    this.model,
                    response.usage.prompt_tokens || 0,
                    response.usage.completion_tokens || 0
                );
                
                tokenUsage = {
                    inputTokens: response.usage.prompt_tokens || 0,
                    outputTokens: response.usage.completion_tokens || 0,
                    totalTokens: response.usage.total_tokens || 0,
                    costUSD: cost
                };
            }

            // Extract reasoning content if available
            let thinkingContent = "";
            if (this.enableThinking && (response as any).reasoning) {
                thinkingContent = (response as any).reasoning || "";
            }

            // Log reasoning token breakdown if available
            if (this.enableThinking && tokenUsage && (response.usage as any)?.completion_tokens_details?.reasoning_tokens) {
                const reasoningTokens = (response.usage as any).completion_tokens_details.reasoning_tokens;
                const finalAnswerTokens = tokenUsage.outputTokens - reasoningTokens;
                this.logger(`Output breakdown: ${reasoningTokens} reasoning tokens, ${finalAnswerTokens} final answer tokens`);
            }

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            // Parse and validate the response using Zod
            let parsedContent: unknown;
            try {
                parsedContent = JSON.parse(content);
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
            return [validationResult.data, thinkingContent, tokenUsage];

        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    /**
     * Converts Zod schema to OpenAI-compatible JSON schema
     */
    private zodToOpenAISchema(zodSchema: z.ZodSchema): any {
        // For now, we'll use a simple approach that should work for most cases
        // This can be enhanced later for more complex schemas
        return {
            type: "object",
            properties: this.extractZodProperties(zodSchema),
            required: this.extractZodRequired(zodSchema),
            additionalProperties: false
        };
    }

    /**
     * Extracts properties from a Zod object schema
     */
    private extractZodProperties(zodSchema: z.ZodSchema): any {
        if (zodSchema instanceof z.ZodObject) {
            const properties: any = {};
            const shape = zodSchema.shape;
            
            for (const [key, value] of Object.entries(shape)) {
                properties[key] = this.zodTypeToJsonSchema(value as z.ZodSchema);
            }
            
            return properties;
        }
        return {};
    }

    /**
     * Extracts required fields from a Zod object schema
     */
    private extractZodRequired(zodSchema: z.ZodSchema): string[] {
        if (zodSchema instanceof z.ZodObject) {
            const required: string[] = [];
            const shape = zodSchema.shape;
            
            for (const [key, value] of Object.entries(shape)) {
                const zodType = value as z.ZodSchema;
                if (!zodType.isOptional()) {
                    required.push(key);
                }
            }
            
            return required;
        }
        return [];
    }

    /**
     * Converts individual Zod types to JSON schema format
     */
    private zodTypeToJsonSchema(zodType: z.ZodSchema): any {
        if (zodType instanceof z.ZodString) {
            return { type: "string", description: zodType.description };
        }
        if (zodType instanceof z.ZodNumber) {
            return { type: "number", description: zodType.description };
        }
        if (zodType instanceof z.ZodBoolean) {
            return { type: "boolean", description: zodType.description };
        }
        if (zodType instanceof z.ZodArray) {
            return {
                type: "array",
                items: this.zodTypeToJsonSchema(zodType.element),
                description: zodType.description
            };
        }
        if (zodType instanceof z.ZodObject) {
            return {
                type: "object",
                properties: this.extractZodProperties(zodType),
                required: this.extractZodRequired(zodType),
                additionalProperties: false,
                description: zodType.description
            };
        }
        
        // Fallback for other types
        return { type: "string", description: zodType.description || "Unknown type" };
    }

    private convertToChatMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'developer' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        })) as OpenAI.Chat.ChatCompletionMessageParam[];
    }

    private convertToOpenAIInput(messages: AIMessage[]): Array<{role: string, content: string}> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'developer' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }
}