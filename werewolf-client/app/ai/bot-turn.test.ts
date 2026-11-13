import { LLM_CONSTANTS } from '@hiper2d/ai-agents';
import { askBotChoice, askBotText, botAnswerFormatLine, BotTurnZodSchema, resolveBotAction, usesSharedSchema } from './bot-turn';
import { BotResponseError } from '@/app/api/game-models';

const agent = (schemaAnswer: unknown, text = '') => ({
    askWithZodSchema: jest.fn().mockResolvedValue([schemaAnswer, 'thought', undefined, 'sig']),
    askText: jest.fn().mockResolvedValue([text, 'thought', undefined, undefined]),
}) as any;

describe('shared bot answer schema', () => {
    it('is the same four nullable string fields for every turn', () => {
        expect(Object.keys(BotTurnZodSchema.shape)).toEqual(['comment', 'target', 'action', 'story']);
        expect(BotTurnZodSchema.parse({ comment: null, target: null, action: null, story: null }))
            .toEqual({ comment: null, target: null, action: null, story: null });
    });

    it('covers the providers that enforce schemas and leaves the rest on text', () => {
        for (const id of [LLM_CONSTANTS.GPT, LLM_CONSTANTS.CLAUDE_HAIKU, LLM_CONSTANTS.GEMINI_FLASH, LLM_CONSTANTS.MISTRAL_SMALL, LLM_CONSTANTS.QWEN_FLASH, LLM_CONSTANTS.KIMI]) {
            expect(usesSharedSchema(id)).toBe(true);
        }
        for (const id of [LLM_CONSTANTS.DEEPSEEK_FLASH, LLM_CONSTANTS.MINIMAX, LLM_CONSTANTS.GROK, LLM_CONSTANTS.GLM, LLM_CONSTANTS.MUSE_SPARK]) {
            expect(usesSharedSchema(id)).toBe(false);
        }
    });

    it('asks a text turn through the schema on an enforcing provider and ignores stray fields', async () => {
        const a = agent({ comment: '  Hello there.  ', target: 'Cedric', action: 'respond', story: '' });
        const [reply, thinking, , signature] = await askBotText(a, [], LLM_CONSTANTS.MISTRAL_SMALL);
        expect(a.askWithZodSchema).toHaveBeenCalledWith(BotTurnZodSchema, []);
        expect(a.askText).not.toHaveBeenCalled();
        expect(reply).toBe('Hello there.');
        expect(thinking).toBe('thought');
        expect(signature).toBe('sig');
    });

    it('asks a text turn as plain text elsewhere, unwrapping a one-field JSON reply', async () => {
        const a = agent(null, '{"reply": "Fine by me."}');
        const [reply] = await askBotText(a, [], LLM_CONSTANTS.DEEPSEEK_FLASH);
        expect(a.askText).toHaveBeenCalled();
        expect(a.askWithZodSchema).not.toHaveBeenCalled();
        expect(reply).toBe('Fine by me.');
    });

    it('reads "", "null" and "none" in unused fields as null', async () => {
        const [answer] = await askBotChoice(agent({ comment: 'He lied twice.', target: ' Oren ', action: 'null', story: 'None' }), []);
        expect(answer).toEqual({ comment: 'He lied twice.', target: 'Oren', action: null, story: null });
        const [empty] = await askBotText(agent({ comment: '', target: null, action: null, story: null }), [], LLM_CONSTANTS.GPT);
        expect(empty).toBeNull();
    });

    it('validates the action in code: default when missing, exact match, rejected otherwise', () => {
        const base = { comment: null, target: 'Oren', story: null };
        const allowed = ['protect', 'kill'] as const;
        expect(resolveBotAction({ ...base, action: null }, allowed, 'protect', 'Ron')).toBe('protect');
        expect(resolveBotAction({ ...base, action: ' Kill. ' }, allowed, 'protect', 'Ron')).toBe('kill');
        expect(resolveBotAction({ ...base, action: 'kill Oren' }, allowed, 'protect', 'Ron')).toBe('kill');
        expect(() => resolveBotAction({ ...base, action: 'protect or kill' }, allowed, 'protect', 'Ron')).toThrow(BotResponseError);
        expect(() => resolveBotAction({ ...base, action: 'skill' }, allowed, 'protect', 'Ron')).toThrow(BotResponseError);
        let error: any;
        try { resolveBotAction({ ...base, action: 'heal' }, allowed, 'protect', 'Ron'); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(BotResponseError);
        expect(error.explanation).toContain('EXACTLY ONE of: protect, kill');
    });

    it('tells each turn which fields to fill, and plain prose where there is no schema', () => {
        expect(botAnswerFormatLine(LLM_CONSTANTS.GPT, 'reply')).toContain('Put your reply in `comment`');
        expect(botAnswerFormatLine(LLM_CONSTANTS.GPT, 'notes')).toContain('Put your notes in `comment`');
        expect(botAnswerFormatLine(LLM_CONSTANTS.DEEPSEEK_FLASH, 'reply')).toContain('plain prose only');
        expect(botAnswerFormatLine(LLM_CONSTANTS.DEEPSEEK_FLASH, 'notes')).toBe('');
        // A choice is the shared schema on every provider
        for (const id of [LLM_CONSTANTS.GPT, LLM_CONSTANTS.DEEPSEEK_FLASH]) {
            expect(botAnswerFormatLine(id, 'vote')).toContain('ONE name you vote for in `target`');
            expect(botAnswerFormatLine(id, 'night')).toContain('`action`: one of the actions the command lists');
        }
    });
});
