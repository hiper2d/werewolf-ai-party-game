import {AbstractAgent} from "@/app/ai/abstract-agent";
import OpenAI from "openai";
import {AIMessage} from "@/app/api/game-models";
import {ResponseSchema} from "@/app/ai/prompts/ai-schemas";
import {cleanResponse} from "@/app/utils/message-utils";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";

export class DeepSeekV2Agent extends AbstractAgent {
    private readonly client: OpenAI;

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
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
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
        });
    }

    protected async doAsk(messages: AIMessage[]): Promise<string | null> {
        try {
            const input = this.convertToOpenAIMessages(messages);
            const modelToUse = this.getModelForThinkingMode();
            
            this.logger(this.logTemplates.askingAgent(this.name, modelToUse));
            
            const requestParams: any = {
                model: modelToUse,
                messages: this.addSystemInstruction(input),
                temperature: this.temperature,
            };

            const response = await this.client.chat.completions.create(requestParams);

            // Extract reasoning content if available (from deepseek-reasoner)
            // (already handled in processCompletion method)

            const content = response.choices[0]?.message?.content;
            return content ? cleanResponse(content) : null;
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    protected async doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string]> {
        try {
            const input = this.convertToOpenAIMessages(messages);
            const modelToUse = this.getModelForThinkingMode();
            
            this.logger(this.logTemplates.askingAgent(this.name, modelToUse));
            
            // Add schema instructions to the last message
            const schemaInstructions = this.schemaTemplate.instructions(schema);
            const modifiedInput = [...input];
            const lastMessage = modifiedInput[modifiedInput.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                modifiedInput[modifiedInput.length - 1] = {
                    ...lastMessage,
                    content: `${lastMessage.content}\n\n${schemaInstructions}`
                };
            }

            const requestParams: any = {
                model: modelToUse,
                messages: this.addSystemInstruction(modifiedInput),
                temperature: this.temperature,
            };

            // Add JSON format instruction for deepseek-chat (but not for deepseek-reasoner)
            if (!this.enableThinking) {
                requestParams.response_format = { type: 'json_object' };
            }

            const response = await this.client.chat.completions.create(requestParams);

            // Extract reasoning content if available (from deepseek-reasoner)
            let thinkingContent = "";
            if (this.enableThinking && response.choices[0]?.message) {
                const reasoning = (response.choices[0].message as any).reasoning_content;
                if (reasoning) {
                    thinkingContent = reasoning;
                }
            }

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error(this.errorMessages.emptyResponse);
            }

            return [cleanResponse(content), thinkingContent];
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private convertToOpenAIMessages(messages: AIMessage[]): Array<{role: string, content: string}> {
        const preparedMessages = this.prepareMessages(messages);
        return preparedMessages.map(msg => ({
            role: msg.role === 'developer' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));
    }

    private addSystemInstruction(messages: Array<{role: string, content: string}>): Array<{role: string, content: string}> {
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

    private getModelForThinkingMode(): string {
        const deepSeekConfig = SupportedAiModels[LLM_CONSTANTS.DEEPSEEK] as any;
        
        if (this.enableThinking) {
            const reasonerModel = deepSeekConfig.reasonerModelApiName;
            if (reasonerModel !== this.model) {
                this.logger(this.logTemplates.switchingModel(this.model, reasonerModel));
            }
            return reasonerModel;
        }
        
        return deepSeekConfig.modelApiName;
    }
}