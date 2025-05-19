import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { GoogleGenAI } from "@google/genai";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";
import { cleanResponse } from "@/app/utils/message-utils";

type GoogleRole = 'model' | 'user';

// Define types for the new Google GenAI SDK
interface Part {
    text: string;
}

interface Content {
    role: GoogleRole;
    parts: Part[];
}

export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenAI;
    private readonly defaultConfig = {
        responseMimeType: "application/json"
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
        emptyResponse: 'Empty response from Google API',
        invalidFormat: 'Invalid response format from Google API',
        apiError: (error: unknown) =>
            `Failed to get response from Google API: ${error instanceof Error ? error.message : String(error)}`,
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
        this.client = new GoogleGenAI({
            apiKey: apiKey
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(this.logTemplates.askingAgent(this.name, this.model));
        this.logger(this.logTemplates.messages(messages));

        try {
            const contents = this.convertToContents(messages);
            
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents,
                config: {
                    temperature: this.temperature
                }
            });
            
            if (!response.text) {
                throw new Error(this.errorMessages.emptyResponse);
            }
            
            const reply = cleanResponse(response.text);
            this.logger(this.logTemplates.reply(reply));
            return reply;
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            return null;
        }
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(this.logTemplates.askingAgent(this.name, this.model));
        this.logger(this.logTemplates.messages(messages));

        try {
            // Convert all messages except the last one
            const historyMessages = messages.slice(0, -1);
            const contents = this.convertToContents(historyMessages);
            
            // Get the last message and add schema instructions
            const lastMessage = messages[messages.length - 1];
            const schemaInstructions = this.buildSchemaInstructions(schema);
            const fullPrompt = this.buildFullPrompt(lastMessage.content, schemaInstructions);
            
            // Add the last message with schema instructions
            contents.push({
                role: this.convertRole(lastMessage.role),
                parts: [{ text: fullPrompt }]
            });
            
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: contents,
                config: {
                    temperature: this.temperature,
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            
            if (!response.text) {
                throw new Error(this.errorMessages.emptyResponse);
            }
            
            const reply = cleanResponse(response.text);
            this.logger(this.logTemplates.reply(reply));
            return reply;
        } catch (error) {
            this.logger(this.logTemplates.error(this.name, error));
            return null;
        }
    }

    private buildSchemaInstructions(schema: ResponseSchema): string {
        return this.schemaTemplate.instructions(schema);
    }

    private buildFullPrompt(content: string, instructions: string): string {
        return `${content}

${instructions}`;
    }

    private convertToContents(messages: AIMessage[]): Content[] {
        try {
            return messages.map(msg => ({
                role: this.convertRole(msg.role),
                parts: [{ text: msg.content }]
            }));
        } catch (error) {
            throw error;
        }
    }

    private convertRole(role: string): GoogleRole {
        if (role === 'assistant') {
            return 'model';
        }
        if (role === 'user' || role === 'system') {
            return 'user';
        }
        throw new Error(this.errorMessages.unsupportedRole(role));
    }
}
