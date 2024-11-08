import {AgentMessageDto} from "@/app/ai/models";

export abstract class AbstractAgent {
    id: string;
    name: string;
    instruction: string;
    temperature: number;

    protected constructor(id: string, name: string, instruction: string, temperature: number) {
        this.id = id;
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
    }

    abstract ask(messages: AgentMessageDto[]): Promise<string | null>;

    protected logger(message: string): void {
        console.log(`[${this.name}]: ${message}`);
    }
}