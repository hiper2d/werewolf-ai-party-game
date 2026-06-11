/**
 * Guard tests: every schema in the registry must be convertible to every
 * provider's wire format. This is what prevents the class of bug where a
 * schema definition (e.g. `.optional()` without `.nullable()`) ships fine
 * for most providers but makes OpenAI strict mode reject every request —
 * killing Doctor/Detective night actions on GPT-5 bots.
 */
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { ZodSchemaRegistry } from './zod-schemas';
import { ZodSchemaConverter, ProviderType } from '../zod-schema-converter';

const PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'google', 'mistral', 'deepseek', 'grok', 'kimi'];

describe('ZodSchemaRegistry provider compatibility', () => {
    const entries = Object.entries(ZodSchemaRegistry);

    it.each(entries)('%s is accepted by OpenAI strict mode (zodTextFormat)', (name, schema) => {
        expect(() => zodTextFormat(schema as z.ZodSchema, name)).not.toThrow();
    });

    it.each(entries)('%s extended with thinking (GPT-5 thinking mode) is accepted by zodTextFormat', (name, schema) => {
        // Mirrors Gpt5Agent.askWithZodSchema's enableThinking extension
        const extended = (schema as z.ZodObject<any>).extend({
            thinking: z.string().describe('Reasoning')
        });
        expect(() => zodTextFormat(extended, name)).not.toThrow();
    });

    it.each(entries)('%s converts for every provider without throwing', (name, schema) => {
        for (const provider of PROVIDERS) {
            expect(() => ZodSchemaConverter.forProvider(schema as z.ZodSchema, provider, name)).not.toThrow();
        }
    });

    it('guard sanity check: zodTextFormat rejects .optional() without .nullable()', () => {
        const broken = z.object({
            action_type: z.enum(['protect', 'kill']).optional()
        });
        expect(() => zodTextFormat(broken, 'broken')).toThrow();
    });
});
