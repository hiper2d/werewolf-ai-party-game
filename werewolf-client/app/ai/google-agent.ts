import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";

// API Docs: https://ai.google.dev/gemini-api/docs/text-generation?lang=node
export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenerativeAI;
    private readonly modelObj: any;
    private chat: any | null = null;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new GoogleGenerativeAI(apiKey);
        
        // Removed schema from the constructor. The schema will be passed via the ask method.
        this.modelObj = this.client.getGenerativeModel({
            model: model,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });
    }

    // Implementation without schema
    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent. Last message: ${messages[messages.length - 1].content}`);

        const config: any = {
            system_instruction: this.instruction
        };

        try {
            if (!this.chat) {
                this.chat = this.modelObj.startChat({
                    history: messages.map((message) => ({
                        role: message.role === 'assistant' ? 'model' : message.role,
                        parts: [{ text: message.content }],
                    })),
                    config: config
                });
            }

            const response = await this.chat.sendMessage({ text: messages[messages.length - 1].content });
            return typeof response === 'string' ? response : response.reply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }

    // Implementation with schema
    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent with schema. Last message: ${messages[messages.length - 1].content}`);

        const config: any = {
            system_instruction: this.instruction,
            responseSchema: schema
        };

        try {
            if (!this.chat) {
                this.chat = this.modelObj.startChat({
                    history: messages.map((message) => ({
                        role: message.role === 'assistant' ? 'model' : message.role,
                        parts: [{ text: message.content }],
                    })),
                    config: config
                });
            }

            const response = await this.chat.sendMessage({ text: messages[messages.length - 1].content });
            return typeof response === 'string' ? response : response.reply;
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }
}
