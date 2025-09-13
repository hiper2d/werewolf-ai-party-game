import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import {AIMessage, MESSAGE_ROLE, TokenUsage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";

export class MistralAgent extends AbstractAgent {
    private readonly client: Mistral;
    private readonly defaultParams: Omit<Parameters<Mistral['chat']['complete']>[0], 'messages'> = {
        model: this.model,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
    };

    // Error message templates
    private readonly errorMessages = {
        emptyResponse: 'Empty or undefined response from Mistral API',
        invalidFormat: 'Invalid response format from Mistral API',
        apiError: (error: unknown) =>
            `Failed to get response from Mistral API: ${error instanceof Error ? error.message : String(error)}`,
    };

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string, enableThinking: boolean = false) {
        super(name, instruction, model, 0.7, enableThinking);
        this.client = new Mistral({apiKey: apiKey});
    }


    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]> {
        const schemaInstructions = this.schemaTemplate.instructions(schema);

        try {
            const systemMessage = (this.enableThinking)
                ? this.createThinkingSystemMessage(schemaInstructions)
                : {type: "system", content: `${this.instruction}\n\n${schemaInstructions}`};

            const chatResponse: ChatCompletionResponse = await this.client.chat.complete({
                model: this.model,
                messages: [
                    systemMessage,
                    ...this.convertToMistralMessages(messages)
                ],
                responseFormat: {type: 'json_object'}
            });

            return this.processReply(chatResponse);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private convertToMistralMessages(messages: AIMessage[]) {
        return messages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role,
            content: msg.content
        }));
    }

    private createThinkingSystemMessage(schemaInstructions: string) {
        const combinedInstructions = `${this.instruction}\n\n${schemaInstructions}`;
        
        return {
            role: MESSAGE_ROLE.SYSTEM,
            content: [
                {
                    type: "text",
                    text: combinedInstructions
                },
                {
                    type: "thinking",
                    thinking: [
                        {
                            type: "text",
                            text: "Think through your response step by step. Consider the instructions carefully and plan your approach before providing the final answer."
                        }
                    ]
                }
            ]
        } as any; // Type assertion needed until SDK supports thinking types
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
        const usage = response?.usage;
        if (!usage) return undefined;

        const inputTokens = usage.promptTokens || 0;
        const outputTokens = usage.completionTokens || 0;
        const totalTokens = usage.totalTokens || inputTokens + outputTokens;
        
        // Calculate cost based on model pricing
        const costUSD = this.calculateCost(inputTokens, outputTokens);

        return {
            inputTokens,
            outputTokens,
            totalTokens,
            costUSD
        };
    }

    private calculateCost(inputTokens: number, outputTokens: number): number {
        // Mistral pricing per 1M tokens (as of documentation)
        // Magistral models: $4 per 1M input, $12 per 1M output
        // These are example prices - should be updated based on actual Mistral pricing
        const pricePerMillionInput = this.model.includes('magistral') ? 4 : 0.15;
        const pricePerMillionOutput = this.model.includes('magistral') ? 12 : 0.45;
        
        const inputCost = (inputTokens / 1_000_000) * pricePerMillionInput;
        const outputCost = (outputTokens / 1_000_000) * pricePerMillionOutput;
        
        return inputCost + outputCost;
    }
}