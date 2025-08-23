import {AbstractAgent} from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import {AIMessage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";

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


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string]> {
        try {
            const input = this.convertToOpenAIInput(messages);
            
            // Ensure schema has additionalProperties: false for OpenAI strict mode
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

            // Add reasoning for thinking mode (only for reasoning models)
            if (this.enableThinking && this.isReasoningModel()) {
                requestParams.reasoning = { 
                    effort: "high",
                    summary: "auto"
                };
            }

            // Check if Responses API is available
            if (!(this.client as any).responses) {
                throw new Error('OpenAI Responses API not available in current SDK version');
            }
            
            const response = await (this.client as any).responses.create(requestParams);

            // Extract reasoning content if available
            let thinkingContent = "";
            if (this.enableThinking && response.output) {
                thinkingContent = this.extractReasoningFromOutput(response.output);
            }

            if (!response.output_text) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            return [cleanResponse(response.output_text), thinkingContent];
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

    private isReasoningModel(): boolean {
        // Check if this is a reasoning model (GPT-5, o1, o3 series)
        return this.model.includes('gpt-5') || 
               this.model.includes('o1') || 
               this.model.includes('o3');
    }

    private extractReasoningFromOutput(output: any[]): string {
        if (!Array.isArray(output)) return "";
        
        const thinkingParts: string[] = [];
        
        for (const item of output) {
            if (item.type === 'reasoning' && item.summary) {
                // Extract reasoning summary from the summary array
                if (Array.isArray(item.summary)) {
                    const summaryTexts = item.summary.map((summaryItem: any) => {
                        if (typeof summaryItem === 'string') {
                            return summaryItem;
                        }
                        if (summaryItem && typeof summaryItem === 'object') {
                            return summaryItem.text || summaryItem.content || JSON.stringify(summaryItem);
                        }
                        return '';
                    }).filter(Boolean);
                    
                    thinkingParts.push(...summaryTexts);
                } else if (typeof item.summary === 'string') {
                    thinkingParts.push(item.summary);
                }
            }
        }
        
        return thinkingParts.join('\n');
    }
}