import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { Anthropic } from '@anthropic-ai/sdk';
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

type AnthropicRole = 'user' | 'assistant';

interface AnthropicMessage {
    role: AnthropicRole;
    content: string;
}

export class ClaudeAgent extends AbstractAgent {
    private readonly client: Anthropic;
    private readonly maxTokens = 1024;
    private readonly defaultParams: Omit<Anthropic.MessageCreateParams, 'messages'> = {
        max_tokens: this.maxTokens,
        system: this.instruction,
        model: this.model,
        temperature: this.temperature,
    };

    // Log message templates
    private readonly logTemplates = {
        askingAgent: (name: string, model: string) => `Asking ${name} ${model} agent`,
        messages: (msgs: AIMessage[]) => `Messages:\n${JSON.stringify(msgs, null, 2)}`,
        reply: (text: string) => `Reply: ${text}`,
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

    // Schema instruction template
    private readonly schemaTemplate = {
        instructions: (schema: ResponseSchema) =>
            `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`,
    };

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new Anthropic({
            apiKey: apiKey,
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        return null; // Method kept empty to maintain inheritance
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string> {
        this.logger(this.logTemplates.askingAgent(this.name, this.model));
        this.logger(this.logTemplates.messages(messages));

        const aiMessages = this.prepareMessages(messages);
        this.printMessages(aiMessages);

        const schemaInstructions = this.buildSchemaInstructions(schema);
        const lastMessage = aiMessages[aiMessages.length - 1];
        const fullPrompt = this.buildFullPrompt(lastMessage.content, schemaInstructions);
        aiMessages[aiMessages.length - 1] = { ...lastMessage, content: fullPrompt };

        const params: Anthropic.MessageCreateParams = {
            ...this.defaultParams,
            messages: this.convertToAnthropicMessages(aiMessages),
        };

        let response;
        try {
            // fixms: for some reason, the last message has the assistant type from Sparks, i.e. self = what to do with it?
            response = await this.client.messages.create(params);
            if (!('content' in response) || !Array.isArray(response.content) || response.content.length === 0) {
                throw new Error(this.errorMessages.emptyResponse);
            }
            const content = response.content[0];
            if (!('text' in content)) {
                throw new Error(this.errorMessages.invalidFormat);
            }
            const reply = cleanResponse(content.text);
            this.logger(this.logTemplates.reply(reply));
            return reply;
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            throw new Error(this.errorMessages.apiError(error));
        }
    }

    private buildSchemaInstructions(schema: ResponseSchema): string {
        return this.schemaTemplate.instructions(schema);
    }

    private buildFullPrompt(content: string, instructions: string): string {
        return `${content}

${instructions}`;
    }

    private convertToAnthropicMessages(messages: AIMessage[]): AnthropicMessage[] {
        return messages.map(msg => ({
            role: this.convertRole(msg.role),
            content: msg.content
        }));
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
}
