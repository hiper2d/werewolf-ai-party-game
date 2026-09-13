import { actorsOnProvider, assertProviderNotBlocked, isProviderBlockedError, providerBlockMessage, providerKeyOf, ProviderBlockedError, refusalReasonLabel } from './provider-blocks';
import { GAME_MASTER, type Game, type ProviderBlock } from './game-models';

const googleBlock: ProviderBlock = { provider: 'Google', reason: 'PROHIBITED_CONTENT', model: 'gemini-flash', botName: 'Marina', day: 1, at: 1 };

function game(overrides: Partial<Game> = {}): Game {
    return {
        gameMasterAiType: 'gemini-pro',
        bots: [
            { name: 'Marina', aiType: 'gemini-flash', isAlive: true },
            { name: 'Ondina', aiType: 'gemini-lite', isAlive: true },
            { name: 'Liora', aiType: 'gemini-flash', isAlive: false },
            { name: 'Coral', aiType: 'muse-spark', isAlive: true },
        ],
        providerBlocks: { GOOGLE_API_KEY: googleBlock },
        ...overrides,
    } as unknown as Game;
}

describe('provider blocks', () => {
    it('keys providers by api-key name and ignores unknown models', () => {
        expect(providerKeyOf('gemini-flash')).toBe('GOOGLE_API_KEY');
        expect(providerKeyOf('qwen-flash')).toBe('QWEN_API_KEY');
        expect(providerKeyOf('no-such-model')).toBeUndefined();
        expect(providerKeyOf(undefined)).toBeUndefined();
    });

    it('throws a typed, recognizable error for a blocked provider and passes others', () => {
        const err = (() => { try { assertProviderNotBlocked(game(), 'gemini-lite'); } catch (e) { return e as any; } })();
        expect(err).toBeInstanceOf(ProviderBlockedError);
        expect(err.code).toBe('PROVIDER_BLOCKED');
        expect(err.providerKey).toBe('GOOGLE_API_KEY');
        expect(err.message).toBe('Google is blocked in this game: its content filter refused the story on day 1 (prohibited content). Pick a model from another provider.');
        expect(isProviderBlockedError(err.message)).toBe(true);
        expect(() => assertProviderNotBlocked(game(), 'muse-spark')).not.toThrow();
        expect(() => assertProviderNotBlocked(game({ providerBlocks: {} }), 'gemini-lite')).not.toThrow();
        expect(() => assertProviderNotBlocked(undefined, 'gemini-lite')).not.toThrow();
    });

    it('lists the alive bots and the Game Master still on the provider, minus the failed actor', () => {
        expect(actorsOnProvider(game(), 'GOOGLE_API_KEY', 'Marina')).toEqual(['Ondina', GAME_MASTER]);
        expect(actorsOnProvider(game(), 'GOOGLE_API_KEY', GAME_MASTER)).toEqual(['Marina', 'Ondina']);
        expect(actorsOnProvider(game({ gameMasterAiType: 'muse-spark' }), 'GOOGLE_API_KEY')).toEqual(['Marina', 'Ondina']);
    });

    it('renders provider labels for people', () => {
        expect(refusalReasonLabel('PROHIBITED_CONTENT')).toBe('prohibited content');
        expect(refusalReasonLabel('DataInspectionFailed')).toBe('inappropriate content');
        expect(refusalReasonLabel('refusal')).toBeUndefined();
        expect(providerBlockMessage({ ...googleBlock, reason: 'refusal' })).toBe('Google is blocked in this game: its content filter refused the story on day 1. Pick a model from another provider.');
        expect(isProviderBlockedError('Empty response from Google API')).toBe(false);
    });
});
