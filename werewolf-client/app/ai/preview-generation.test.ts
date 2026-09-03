/**
 * Unit tests for the two-stage preview pipeline: batch splitting, sheet assembly,
 * voice uniqueness after parallel batches, usage summing, and the failure model
 * (any bad stage fails the whole preview — no backend retries).
 */
import {
    assignUniqueVoices,
    CHARACTER_SHEET_BATCH_SIZE,
    generateGamePreview,
    splitIntoBatches,
    sumTokenUsage,
} from './preview-generation';
import { CASTING_SYSTEM_PROMPT, CHARACTER_SHEET_SYSTEM_PROMPT } from './prompts/story-gen-prompts';
import { GameCastingZodSchema, CharacterSheetBatchZodSchema } from './prompts/zod-schemas';

const MALE_VOICES = ['m1', 'm2', 'm3'];
const FEMALE_VOICES = ['f1', 'f2'];

const voiceConfig: any = {
    provider: 'openai',
    getVoices: () => [...MALE_VOICES.map(id => ({ id, gender: 'male' })), ...FEMALE_VOICES.map(id => ({ id, gender: 'female' }))],
    getVoicesByGender: (g: string) => (g === 'male' ? MALE_VOICES : FEMALE_VOICES).map(id => ({ id, gender: g, description: `${id} voice`, celebrityExamples: [] })),
    getVoiceById: (id: string) => {
        if (MALE_VOICES.includes(id)) return { id, gender: 'male' };
        if (FEMALE_VOICES.includes(id)) return { id, gender: 'female' };
        return undefined;
    },
    getPromptDescription: () => 'all voices',
};

const usage = (outputTokens: number) => ({ inputTokens: 10, outputTokens, totalTokens: 10 + outputTokens, costUSD: outputTokens / 1000 });

function castOf(n: number) {
    return Array.from({ length: n }, (_, i) => ({ name: `Bot${i + 1}`, gender: i % 2 === 0 ? 'male' : 'female' }));
}

/** Parses the names the pipeline asked for out of a character-sheet user prompt. */
function batchNames(prompt: string): string[] {
    const block = prompt.slice(prompt.indexOf('<Batch>'), prompt.indexOf('</Batch>'));
    return [...block.matchAll(/- (\w+) \(/g)].map(m => m[1]);
}

/** Fake agent factory: casting returns `cast`; each batch call returns sheets for exactly
 * the names it was asked for (or whatever `sheetsFor` says). Records every call. */
function fakeAgents(cast: { name: string; gender: string }[], opts: {
    sheetsFor?: (names: string[]) => any[];
    voiceFor?: (name: string, gender: string) => string;
} = {}) {
    const calls: { systemPrompt: string; schema: unknown; prompt: string }[] = [];
    const created: string[] = [];
    const createAgent = (systemPrompt: string) => {
        created.push(systemPrompt);
        return {
            askWithZodSchema: jest.fn(async (schema: unknown, messages: { content: string }[]) => {
                const prompt = messages[0].content;
                calls.push({ systemPrompt, schema, prompt });
                if (schema === GameCastingZodSchema) {
                    return [{ scene: 'A dark manor on a stormy night.', gameMasterVoice: 'm1', gameMasterVoiceStyle: 'gravely', cast }, '', usage(100)];
                }
                const names = batchNames(prompt);
                const sheets = opts.sheetsFor ? opts.sheetsFor(names) : names.map(name => {
                    const gender = cast.find(c => c.name === name)!.gender;
                    return {
                        name,
                        story: `${name} has a past.`,
                        playStyle: 'normal',
                        voice: opts.voiceFor ? opts.voiceFor(name, gender) : (gender === 'male' ? 'm1' : 'f1'),
                        voiceStyle: 'quietly',
                        visualDescription: `${name} looks tired.`,
                    };
                });
                return [{ players: sheets }, '', usage(400)];
            }),
        } as any;
    };
    return { createAgent, calls, created };
}

const input = (botCount: number) => ({
    theme: 'Victorian Manor',
    description: '',
    excludedName: 'Human',
    botCount,
    werewolfCount: 2,
    gameRolesText: '- werewolf',
    playStylesText: '* normal: Normal - plain',
    voiceConfig,
});

describe('splitIntoBatches', () => {
    it('splits evenly so no batch is a lone character', () => {
        expect(splitIntoBatches([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3], [4, 5]]);
        expect(splitIntoBatches([1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
        expect(splitIntoBatches(Array.from({ length: 15 }, (_, i) => i), 4).map(b => b.length)).toEqual([4, 4, 4, 3]);
    });

    it('handles tiny and empty casts', () => {
        expect(splitIntoBatches([1, 2, 3], 4)).toEqual([[1, 2, 3]]);
        expect(splitIntoBatches([], 4)).toEqual([]);
    });
});

describe('assignUniqueVoices', () => {
    it('keeps valid distinct picks and reassigns collisions from the unused pool of the same gender', () => {
        const players: { gender: 'male' | 'female'; voice: string }[] = [
            { gender: 'male', voice: 'm1' },
            { gender: 'male', voice: 'm1' },   // collision
            { gender: 'female', voice: 'f2' },
            { gender: 'female', voice: 'f2' }, // collision
        ];
        assignUniqueVoices(players, voiceConfig);
        expect(players[0].voice).toBe('m1');
        expect(['m2', 'm3']).toContain(players[1].voice);
        expect(players[2].voice).toBe('f2');
        expect(players[3].voice).toBe('f1');
    });

    it('replaces unknown voices and gender-mismatched voices', () => {
        const players: { gender: 'male' | 'female'; voice: string }[] = [
            { gender: 'female', voice: 'm1' },      // wrong gender
            { gender: 'male', voice: 'nonexistent' },
        ];
        assignUniqueVoices(players, voiceConfig);
        expect(FEMALE_VOICES).toContain(players[0].voice);
        expect(MALE_VOICES).toContain(players[1].voice);
    });

    it('reuses voices only once a gender pool is exhausted', () => {
        const players = Array.from({ length: 4 }, () => ({ gender: 'female' as const, voice: 'f1' }));
        assignUniqueVoices(players, voiceConfig);
        expect(new Set(players.slice(0, 2).map(p => p.voice)).size).toBe(2); // f1, f2
        for (const p of players) expect(FEMALE_VOICES).toContain(p.voice);
    });
});

describe('sumTokenUsage', () => {
    it('sums every field and is undefined when nothing reported usage', () => {
        expect(sumTokenUsage([undefined, undefined])).toBeUndefined();
        const total = sumTokenUsage([
            { ...usage(100), reasoningTokens: 5, durationMs: 1000 },
            undefined,
            { ...usage(200), reasoningTokens: 7, durationMs: 2000, cachedInputTokens: 3 },
        ]);
        expect(total).toEqual({
            inputTokens: 20, outputTokens: 300, totalTokens: 320, costUSD: 0.3,
            reasoningTokens: 12, durationMs: 3000, cachedInputTokens: 3,
        });
    });
});

describe('generateGamePreview', () => {
    it('casts once, writes sheets in parallel batches, and assembles every character in cast order', async () => {
        const cast = castOf(9);
        const { createAgent, calls, created } = fakeAgents(cast);

        const preview = await generateGamePreview(createAgent, input(9));

        // One agent per system prompt: casting first, then sheets
        expect(created).toEqual([CASTING_SYSTEM_PROMPT, CHARACTER_SHEET_SYSTEM_PROMPT]);
        const batchCalls = calls.filter(c => c.schema === CharacterSheetBatchZodSchema);
        expect(calls[0].schema).toBe(GameCastingZodSchema);
        expect(batchCalls.length).toBe(Math.ceil(9 / CHARACTER_SHEET_BATCH_SIZE));
        expect(batchCalls.map(c => batchNames(c.prompt))).toEqual([
            ['Bot1', 'Bot2', 'Bot3'], ['Bot4', 'Bot5', 'Bot6'], ['Bot7', 'Bot8', 'Bot9'],
        ]);
        // Every batch sees the scene and the full cast for coherence
        for (const c of batchCalls) {
            expect(c.prompt).toContain('A dark manor on a stormy night.');
            expect(c.prompt).toContain('Bot1 (male), Bot2 (female)');
        }
        // A batch is only shown voices for the genders it contains
        expect(batchCalls[0].prompt).toContain('- m1 (male)');
        expect(batchCalls[0].prompt).toContain('- f1 (female)');

        expect(preview.scene).toBe('A dark manor on a stormy night.');
        expect(preview.gameMasterVoice).toBe('m1');
        expect(preview.gameMasterVoiceStyle).toBe('gravely');
        expect(preview.players.map(p => p.name)).toEqual(cast.map(c => c.name));
        expect(preview.players.map(p => p.gender)).toEqual(cast.map(c => c.gender));
        for (const p of preview.players) {
            expect(p.story).toBe(`${p.name} has a past.`);
            expect(p.visualDescription).toBe(`${p.name} looks tired.`);
            expect(p.playStyle).toBe('normal');
            expect(p.voiceStyle).toBe('quietly');
        }

        // Usage is summed over casting + 3 batches; stages keep the breakdown
        expect(preview.stages.map(s => s.label)).toEqual(['casting', 'character sheets 1/3', 'character sheets 2/3', 'character sheets 3/3']);
        expect(preview.tokenUsage).toMatchObject({ outputTokens: 100 + 3 * 400, costUSD: 1.3 });
    });

    it('makes voices unique across batches that all picked the same voice', async () => {
        const cast = castOf(5); // 3 male, 2 female
        const { createAgent } = fakeAgents(cast); // every male gets m1, every female f1

        const preview = await generateGamePreview(createAgent, input(5));

        const males = preview.players.filter(p => p.gender === 'male').map(p => p.voice);
        const females = preview.players.filter(p => p.gender === 'female').map(p => p.voice);
        expect(new Set(males).size).toBe(3);
        expect(new Set(females).size).toBe(2);
        expect(males[0]).toBe('m1'); // the first pick survives
        expect(females[0]).toBe('f1');
    });

    it('matches sheets to the cast by name loosely (case / spacing), and tolerates extra sheets', async () => {
        const cast = castOf(2);
        const { createAgent } = fakeAgents(cast, {
            sheetsFor: (names) => [
                { name: 'Stray', story: 's', playStyle: 'normal', voice: 'm1', voiceStyle: 'x', visualDescription: 'v' },
                ...names.map(name => ({ name: name.toUpperCase() + ' ', story: `${name} story`, playStyle: 'normal', voice: 'm1', voiceStyle: 'x', visualDescription: 'v' })),
            ],
        });

        const preview = await generateGamePreview(createAgent, input(2));

        expect(preview.players.map(p => p.name)).toEqual(['Bot1', 'Bot2']); // cast names win
        expect(preview.players.map(p => p.story)).toEqual(['Bot1 story', 'Bot2 story']);
    });

    it('falls back to a random valid playstyle when the sheet has an unknown one', async () => {
        const cast = castOf(1);
        const { createAgent } = fakeAgents(cast, {
            sheetsFor: (names) => names.map(name => ({ name, story: 's', playStyle: 'berserker', voice: 'm1', voiceStyle: 'x', visualDescription: 'v' })),
        });
        const preview = await generateGamePreview(createAgent, input(1));
        expect(['aggressive_provoker', 'protective_team_player', 'trickster', 'rule_breaker', 'modest_mouse', 'normal']).toContain(preview.players[0].playStyle);
    });

    it('falls back to a random male voice for an unknown Game Master voice', async () => {
        const cast = castOf(1);
        const { createAgent } = fakeAgents(cast);
        const origCreate = createAgent;
        const patched = (systemPrompt: string) => {
            const agent = origCreate(systemPrompt);
            const inner = agent.askWithZodSchema;
            agent.askWithZodSchema = jest.fn(async (schema: unknown, messages: any) => {
                const [result, thinking, u] = await inner(schema, messages);
                return schema === GameCastingZodSchema ? [{ ...result, gameMasterVoice: 'ghost' }, thinking, u] : [result, thinking, u];
            });
            return agent;
        };
        const preview = await generateGamePreview(patched, input(1));
        expect(MALE_VOICES).toContain(preview.gameMasterVoice);
    });

    it('fails when the cast size is wrong or names collide', async () => {
        await expect(generateGamePreview(fakeAgents(castOf(3)).createAgent, input(4)))
            .rejects.toThrow('The AI cast 3 characters instead of 4');
        const dupes = [{ name: 'Same', gender: 'male' }, { name: 'same', gender: 'female' }];
        await expect(generateGamePreview(fakeAgents(dupes).createAgent, input(2)))
            .rejects.toThrow('duplicate character names');
    });

    it('fails when a batch omits one of its characters', async () => {
        const cast = castOf(4);
        const { createAgent } = fakeAgents(cast, {
            sheetsFor: (names) => names.slice(1).map(name => ({ name, story: 's', playStyle: 'normal', voice: 'm1', voiceStyle: 'x', visualDescription: 'v' })),
        });
        await expect(generateGamePreview(createAgent, input(4)))
            .rejects.toThrow('did not return a character sheet for Bot1');
    });

    it('propagates a failed batch call — no retries', async () => {
        const cast = castOf(8);
        const { createAgent } = fakeAgents(cast);
        let n = 0;
        const flaky = (systemPrompt: string) => {
            const agent = createAgent(systemPrompt);
            const inner = agent.askWithZodSchema;
            agent.askWithZodSchema = jest.fn(async (schema: unknown, messages: any) => {
                if (schema === CharacterSheetBatchZodSchema && ++n === 2) throw new Error('429 rate limited');
                return inner(schema, messages);
            });
            return agent;
        };
        await expect(generateGamePreview(flaky, input(8))).rejects.toThrow('429 rate limited');
        expect(n).toBe(2); // both batches were attempted once, nothing re-issued
    });
});
