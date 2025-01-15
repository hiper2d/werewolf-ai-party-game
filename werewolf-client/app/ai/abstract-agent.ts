import {AIMessage} from "@/app/api/game-models";

export abstract class AbstractAgent {
    name: string;
    protected readonly instruction: string;
    protected readonly temperature: number;
    protected readonly model: string;

    protected constructor(name: string, instruction: string, model: string, temperature: number) {
        this.name = name;
        this.instruction = instruction;
        this.temperature = temperature;
        this.model = model;
    }

    abstract ask(messages: AIMessage[]): Promise<string | null>

    protected logger(message: string): void {
        console.log(`[${this.name} ${this.model}]: ${message}`);
    }

    protected printMessages(messages: AIMessage[]): void {
        console.log(`\n[${this.name} ${this.model}] Message History:`);
        messages.forEach((msg, index) => {
            if (msg.role !== 'system') {
                console.log(`${index}. ${msg.role}: ${msg.content}`);
            }
        });
        console.log('');
    }

    protected prepareMessages(messages: AIMessage[]): AIMessage[] {
        return messages;
    }
}
