import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// API Docs: https://ai.google.dev/gemini-api/docs/text-generation?lang=node
export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenerativeAI;
    private readonly modelObj: any;
    private chat: any | null = null;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new GoogleGenerativeAI(apiKey);
        
        const botAnswerSchema = {
            type: SchemaType.OBJECT,
            properties: {
                reply: {
                    type: SchemaType.STRING,
                    description: "The bot's response message",
                    nullable: false,
                }
            },
            required: ["reply"]
        };

        this.modelObj = this.client.getGenerativeModel({
            model: model,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: botAnswerSchema
            }
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent. Last message: ${messages[messages.length - 1].content}`);

        try {
            // Initialize chat if not already started
            if (!this.chat) {
                this.chat = this.modelObj.startChat({
                    history: messages.map((message) => ({
                        role: message.role === 'assistant' ? 'model' : message.role,
                        parts: [{ text: message.content }],
                    })),
                    config: {
                        system_instruction: this.instruction
                    }
                });
            }

            // Send the latest message to the chat
            const userMessage = messages[messages.length - 1].content;
            const result = await this.chat.sendMessage(userMessage);

            const res = result.response.text();

            this.logger(`Reply: ${res}`);
            return res;
        } catch (error) {
            console.error('Error in GoogleAgent.ask:', error);
            return null;
        }
    }
}
