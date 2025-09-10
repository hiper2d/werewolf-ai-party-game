import {AbstractAgent} from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import {AIMessage, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {calculateOpenAICost} from "@/app/utils/openai-pricing";

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

            const strictSchema = {
                ...schema,
                additionalProperties: false,
                ...(schema.properties && {
                    properties: Object.fromEntries(
                        Object.entries(schema.properties).map(([key, prop]: [string, any]) => [
                            key,
                            typeof prop === 'object' && prop.type === 'object' 
                                ? { ...prop, additionalProperties: false }
                                : prop
                        ])
                    )
                })
            };

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

    private convertToOpenAIInput(messages: AIMessage[]): Array<{role: string, content: string}> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'developer' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }
}