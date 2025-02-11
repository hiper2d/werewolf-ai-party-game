import { AbstractAgent } from "@/app/ai/abstract-agent";
import { AIMessage } from "@/app/api/game-models";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ResponseSchema } from "@/app/ai/prompts/ai-schemas";

// API Docs: https://ai.google.dev/gemini-api/docs/text-generation?lang=node
export class GoogleAgent extends AbstractAgent {
    private readonly client: GoogleGenerativeAI;
    private readonly modelObj: any;

    constructor(name: string, instruction: string, model: string, apiKey: string) {
        super(name, instruction, model, 0.2);
        this.client = new GoogleGenerativeAI(apiKey);

        this.modelObj = this.client.getGenerativeModel({
            model: model,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });
    }

    async ask(messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent.`);
        this.logger(`Messages:\n${JSON.stringify(messages, null, 2)}`);

        try {
            const history: Array<{}> = messages.map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
            }));

            const chat = this.modelObj.startChat({
                history: history
            });

            const result = await chat.sendMessage(messages[messages.length - 1].content);
            const response = await result.response;
            return response.text();
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }

    async askWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<string | null> {
        this.logger(`Asking ${this.name} ${this.model} agent with schema.`);
        this.logger(`Messages:\n${JSON.stringify(messages, null, 2)}`);

        try {
            const history: Array<{}> = messages.map((message) => ({
                role: message.role === 'assistant' ? 'model' : message.role,
                parts: [{ text: message.content }],
            }));

            const chat = this.modelObj.startChat({
                history: history
            });

            // Construct the full prompt with schema instructions
            const schemaInstructions = `Your response must be a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Ensure your response strictly follows the schema requirements.`;

            const fullPrompt = `${messages[messages.length - 1].content}

${schemaInstructions}`;

            const result = await chat.sendMessage(fullPrompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            this.logger(`Error in ${this.name} agent: ${error}`);
            return null;
        }
    }
}
