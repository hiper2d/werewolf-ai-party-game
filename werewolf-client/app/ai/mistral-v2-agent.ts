import {AbstractAgent} from "@/app/ai/abstract-agent";
import {Mistral} from "@mistralai/mistralai";
import {ChatCompletionResponse} from "@mistralai/mistralai/models/components";
import {AIMessage, MESSAGE_ROLE} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";

export class MistralV2Agent extends AbstractAgent {
    private readonly client: Mistral;

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        error: (name: string, error: unknown) => `Error in ${name} agent: ${error}`,
        switchingModel: (from: string, to: string) => `Switching from ${from} to ${to} for reasoning mode`,
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
        super(name, instruction, model, 0.2, enableThinking);
        this.client = new Mistral({apiKey: apiKey});
    }

    protected async doAsk(messages: AIMessage[]): Promise<string | null> {
        try {
            const modelToUse = this.getModelForThinkingMode();
            const mistralMessages = this.convertToMistralMessages(messages);
            
            this.logger(this.logTemplates.askingAgent(this.name, modelToUse));

            const requestParams: any = {
                model: modelToUse,
                messages: this.addSystemInstruction(mistralMessages),
            };

            // Set prompt_mode for reasoning models
            if (this.enableThinking && this.isReasoningModel(modelToUse)) {
                requestParams.prompt_mode = "reasoning";
            }

            const chatResponse = await this.client.chat.complete(requestParams);

            // Process and log thinking content if available
            if (this.enableThinking && chatResponse?.choices?.[0]?.message?.content) {
                this.processThinkingContent(chatResponse.choices[0].message.content);
            }

            return this.extractFinalAnswer(chatResponse);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string> {
        try {
            const modelToUse = this.getModelForThinkingMode();
            
            // Add schema instructions to the last message
            const schemaInstructions = this.schemaTemplate.instructions(schema);
            const lastMessage = messages[messages.length - 1];
            const modifiedMessages = [
                ...messages.slice(0, -1),
                { ...lastMessage, content: `${lastMessage.content}\n\n${schemaInstructions}` }
            ];

            const mistralMessages = this.convertToMistralMessages(modifiedMessages);
            
            this.logger(this.logTemplates.askingAgent(this.name, modelToUse));

            const requestParams: any = {
                model: modelToUse,
                messages: this.addSystemInstruction(mistralMessages),
                responseFormat: {type: 'json_object'}
            };

            // Set prompt_mode for reasoning models
            if (this.enableThinking && this.isReasoningModel(modelToUse)) {
                requestParams.prompt_mode = "reasoning";
            }

            const chatResponse = await this.client.chat.complete(requestParams);

            // Process and log thinking content if available
            if (this.enableThinking && chatResponse?.choices?.[0]?.message?.content) {
                this.processThinkingContent(chatResponse.choices[0].message.content);
            }

            const finalAnswer = this.extractFinalAnswer(chatResponse);
            if (!finalAnswer) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            return cleanResponse(finalAnswer);
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private convertToMistralMessages(messages: AIMessage[]) {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role,
            content: msg.content
        }));
    }

    private addSystemInstruction(messages: Array<{role: string, content: any}>) {
        // Create system content structure for reasoning models
        if (this.enableThinking) {
            const systemContent = [
                {
                    type: "text",
                    text: this.instruction
                },
                {
                    type: "thinking",
                    thinking: [
                        {
                            type: "text",
                            text: "Think through this step by step, considering multiple perspectives and reasoning paths before providing your final answer."
                        }
                    ]
                }
            ];

            // Add structured system message if no system message exists
            if (messages.length === 0 || messages[0].role !== 'system') {
                return [
                    { role: 'system', content: systemContent },
                    ...messages
                ];
            }
            
            // Replace existing system message with structured content
            const updatedMessages = [...messages];
            updatedMessages[0] = {
                role: 'system',
                content: systemContent
            };
            
            return updatedMessages;
        } else {
            // Add simple system instruction for non-reasoning models
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
    }

    private getModelForThinkingMode(): string {
        const modelKey = this.getModelConstantKey();
        if (!modelKey) return this.model;

        const modelConfig = SupportedAiModels[modelKey] as any;
        
        if (this.enableThinking && modelConfig.reasonerModelApiName) {
            const reasonerModel = modelConfig.reasonerModelApiName;
            if (reasonerModel !== this.model) {
                this.logger(this.logTemplates.switchingModel(this.model, reasonerModel));
            }
            return reasonerModel;
        }
        
        return modelConfig.modelApiName || this.model;
    }

    private getModelConstantKey(): string | null {
        // Find which constant corresponds to this model
        for (const [key, config] of Object.entries(SupportedAiModels)) {
            if ((config as any).modelApiName === this.model) {
                return key;
            }
        }
        return null;
    }

    private isReasoningModel(model: string): boolean {
        return model.includes('magistral-');
    }

    private processThinkingContent(content: any): void {
        if (Array.isArray(content)) {
            for (const chunk of content) {
                if (chunk?.type === "thinking" && chunk?.thinking) {
                    const thinkingText = this.extractThinkingText(chunk.thinking);
                    if (thinkingText) {
                        this.logReasoningTokens(thinkingText);
                    }
                }
            }
        }
    }

    private extractThinkingText(thinking: any[]): string {
        return thinking.map(item => {
            if (item?.type === "text" && item?.text) {
                return item.text;
            }
            return "";
        }).join(" ");
    }

    private extractFinalAnswer(response: ChatCompletionResponse | undefined): string | null {
        const content = response?.choices?.[0]?.message?.content;
        
        if (!content) {
            return null;
        }

        // Handle array content structure (from reasoning models)
        if (Array.isArray(content)) {
            return content.map(chunk => {
                if (chunk?.type === "text" && chunk?.text) {
                    return chunk.text;
                }
                return "";
            }).join("");
        }

        // Handle string content (from regular models)
        if (typeof content === "string") {
            return content;
        }

        return null;
    }
}