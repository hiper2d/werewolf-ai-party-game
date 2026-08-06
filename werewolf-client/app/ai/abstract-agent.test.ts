import { AbstractAgent } from './abstract-agent';
import { AIMessage, TokenUsage } from '@/app/api/game-models';
import { z } from 'zod';

const SILENT_LOGGING = { logSystemPrompt: false, logHistory: false, logReply: 'none' } as any;

class FakeAgent extends AbstractAgent {
    constructor(
        private readonly behavior: 'usage' | 'no-usage' | 'throw',
        private readonly delayMs: number = 0
    ) {
        super('Fake', 'instruction', 'fake-model', 0, false, SILENT_LOGGING);
    }

    private async respond(): Promise<[string, string, TokenUsage?, string?]> {
        if (this.delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.delayMs));
        }
        if (this.behavior === 'throw') {
            throw new Error('provider exploded');
        }
        const usage: TokenUsage | undefined = this.behavior === 'usage'
            ? { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUSD: 0.001 }
            : undefined;
        return ['{"reply": "hi"}', '', usage];
    }

    protected async doAskWithZodSchema<T>(_schema: z.ZodSchema<T>, _messages: AIMessage[]): Promise<[T, string, TokenUsage?, string?]> {
        const [content, thinking, usage, sig] = await this.respond();
        return [JSON.parse(content) as T, thinking, usage, sig];
    }

    protected async doAskText(_messages: AIMessage[]): Promise<[string, string, TokenUsage?, string?]> {
        return this.respond();
    }
}

const MESSAGES: AIMessage[] = [{ role: 'user', content: 'hello' }];
const SCHEMA = z.object({ reply: z.string() });

describe('AbstractAgent ask wrappers (duration stamping)', () => {
    it('stamps durationMs onto the TokenUsage returned by askText', async () => {
        const agent = new FakeAgent('usage', 25);
        const [, , usage] = await agent.askText(MESSAGES);
        expect(usage).toBeDefined();
        expect(usage!.durationMs).toBeGreaterThanOrEqual(20);
        // Original fields untouched
        expect(usage!.inputTokens).toBe(10);
        expect(usage!.costUSD).toBe(0.001);
    });

    it('stamps durationMs via askWithZodSchema too', async () => {
        const agent = new FakeAgent('usage', 25);
        const [result, , usage] = await agent.askWithZodSchema(SCHEMA, MESSAGES);
        expect(result.reply).toBe('hi');
        expect(usage!.durationMs).toBeGreaterThanOrEqual(20);
    });

    it('leaves usage undefined when the provider reported none', async () => {
        const agent = new FakeAgent('no-usage');
        const [, , usage] = await agent.askText(MESSAGES);
        expect(usage).toBeUndefined();
    });

    it('attaches durationMs to thrown errors and rethrows them unchanged', async () => {
        const agent = new FakeAgent('throw', 25);
        try {
            await agent.askText(MESSAGES);
            fail('expected throw');
        } catch (error: any) {
            expect(error.message).toBe('provider exploded');
            expect(error.durationMs).toBeGreaterThanOrEqual(20);
        }
    });
});
