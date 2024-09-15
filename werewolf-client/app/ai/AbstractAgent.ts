import {AgentMessageDto, LLMModel} from "@/app/ai/models";

export abstract class AbstractAgent {
    id: string;
    name: string;
    instruction: string;
    model: LLMModel;
    temperature: number;
    client: any;

    constructor(id: string, name: string, instruction: string, model: LLMModel, temperature: number, client: any) {
        this.id = id;
        this.name = name;
        this.instruction = instruction;
        this.model = model;
        this.temperature = temperature;
        this.client = client;
    }

    abstract ask(messages: AgentMessageDto[]): Promise<string | null>;

    protected logger(message: string): void {
        console.log(`[${this.name}]: ${message}`);
    }
}