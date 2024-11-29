import {GameMessage} from "@/app/api/game-models";

export abstract class AbstractAgent {
    name: string;
    instruction: string;
    temperature: number;

    protected constructor(name: string, instruction: string, temperature: number) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
    }

    abstract ask(messages: GameMessage[]): Promise<string | null>;

    protected logger(message: string): void {
        console.log(`[${this.name}]: ${message}`);
    }
}