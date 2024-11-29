import {AbstractAgent} from "@/app/ai/abstract-agent";
import {AIMessage, GameMessage} from "@/app/api/game-models";
import {GoogleGenerativeAI} from "@google/generative-ai";

// API Docs: https://ai.google.dev/gemini-api/docs/text-generation?lang=node
export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenerativeAI;
    private readonly modelObj: any;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, 0.2);
        this.client = new GoogleGenerativeAI(apiKey)
        this.modelObj = this.client.getGenerativeModel({ model: model, systemInstruction: instruction });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        try {
            const result = await this.modelObj.generateContent(messages);
            const res = result.response.text();

            this.logger(`Reply: ${res}`);
            return res;
        } catch (error) {
            console.error('Error in GoogleAgent.ask:', error);
            return null;
        }
    }
}