import {AbstractAgent} from "@/app/ai/abstract-agent";
import {AgentMessageDto} from "@/app/ai/models";
import {GoogleGenerativeAI} from "@google/generative-ai";

// API Docs: https://ai.google.dev/gemini-api/docs/text-generation?lang=node
export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenerativeAI;
    private readonly model: string;
    private readonly modelObj: any;

    constructor(id: string, name: string, instruction: string, model: string, apiKey: string) {
        super(id, name, instruction, 0.2);
        this.model = model;
        this.client = new GoogleGenerativeAI(apiKey)
        this.modelObj = this.client.getGenerativeModel({ model: model });
    }

    async ask(messages: AgentMessageDto[]): Promise<string | null> {
        this.logger(`Asking agent. Message history: ${messages[messages.length - 1].msg}`);

        try {
            const result = await this.modelObj.generateContent(messages[0].msg);
            const res = result.response.text();

            this.logger(`Reply: ${res}`);
            return res;
        } catch (error) {
            console.error('Error in GoogleAgent.ask:', error);
            return null;
        }
    }
}