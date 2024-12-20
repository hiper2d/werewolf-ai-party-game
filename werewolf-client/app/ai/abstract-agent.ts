import {AIMessage} from "@/app/api/game-models";

export abstract class AbstractAgent {
    name: string;
    protected readonly instruction: string;
    protected readonly temperature: number;

    protected constructor(name: string, instruction: string, temperature: number) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
    }

    abstract ask(messages: AIMessage[]): Promise<string | null>

    protected logger(message: string): void {
        console.log(`[${this.name}]: ${message}`);
    }

    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}