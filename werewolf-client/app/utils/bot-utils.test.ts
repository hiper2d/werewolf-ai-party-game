import { getEffectiveModel, generateBotContextSection, generateBotTurnState, buildBotSystemPrompt, buildBotTurnTail } from './bot-utils';
import { Bot, Game, GAME_MASTER, GAME_ROLES } from '@/app/api/game-models';

// getEffectiveModel only reads modelOverride, so a minimal game stub is enough.
const gameWith = (modelOverride: Game['modelOverride']): Game => ({ modelOverride } as Game);

describe('getEffectiveModel', () => {
    it('returns the base model when no override is pending', () => {
        expect(getEffectiveModel(gameWith(null), 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: true });
    });

    it('defaults enableThinking to false when the base flag is undefined', () => {
        expect(getEffectiveModel(gameWith(null), 'Jace', 'mistral-medium-3'))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: false });
    });

    it('applies a pending override for the matching player', () => {
        const game = gameWith({ botName: 'Jace', model: 'claude-fable-5-1', enableThinking: true });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', false))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: true });
    });

    it('ignores an override targeting a different player', () => {
        const game = gameWith({ botName: 'Selkie', model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: true });
    });

    it('uses the override thinking flag, not the base flag, when overriding', () => {
        const game = gameWith({ botName: 'Jace', model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3', true))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: false });
    });

    it('supports the Game Master as an override target', () => {
        const game = gameWith({ botName: GAME_MASTER, model: 'claude-fable-5-1' });
        expect(getEffectiveModel(game, GAME_MASTER, 'gemini-flash', false))
            .toEqual({ aiType: 'claude-fable-5-1', enableThinking: false });
    });

    it('ignores an override with an empty model', () => {
        const game = gameWith({ botName: 'Jace', model: '' });
        expect(getEffectiveModel(game, 'Jace', 'mistral-medium-3'))
            .toEqual({ aiType: 'mistral-medium-3', enableThinking: false });
    });
});

describe('generateBotContextSection — night secrecy', () => {
    const bot = (name: string, role: string, roleKnowledge?: Bot['roleKnowledge']): Bot =>
        ({ name, role, isAlive: true, story: '', aiType: 'x', gender: 'male', voice: 'v', roleKnowledge } as Bot);

    // Night 1: the maniac abducted Leo, the werewolves killed Viktor, the doctor's
    // protection of Leo failed. Old games also carry the leaked `events` list.
    const game = {
        currentDay: 2,
        humanPlayerName: 'Leo',
        bots: [bot('Hermione', GAME_ROLES.MANIAC), bot('Harry', GAME_ROLES.WEREWOLF), bot('Ron', GAME_ROLES.DOCTOR)],
        votingHistory: [{
            day: 1,
            voteCounts: { Viktor: 2, Leo: 1 },
            votes: [
                { order: 1, voter: 'Harry', target: 'Viktor', reason: 'Too quiet all day.' },
                { order: 2, voter: 'Leo', target: 'Harry', reason: '' },
            ],
            eliminatedPlayer: 'Viktor',
            eliminatedPlayerRole: 'villager',
        }],
        nightNarratives: [{
            day: 1,
            narrative: 'Dawn breaks. Viktor lies still.',
            events: [
                { order: 0, role: 'maniac', description: 'Abducted Leo for the night, blocking all actions involving them' },
                { order: 1, role: 'werewolves', description: 'Killed Viktor (villager)' },
            ],
        }],
    } as unknown as Game;

    it('never shows a villager the maniac activity, even on a game doc that stored the old events list', () => {
        const ctx = generateBotContextSection(bot('Luna', GAME_ROLES.VILLAGER), game);
        expect(ctx).toContain('Dawn breaks. Viktor lies still.');
        expect(ctx).not.toMatch(/abduct/i);
        expect(ctx).not.toMatch(/maniac/i);
        expect(ctx).not.toContain('Events');
    });

    it('renders the vote order with reasons, and omits the quote when there is no reason', () => {
        const ctx = generateBotContextSection(bot('Luna', GAME_ROLES.VILLAGER), game);
        expect(ctx).toContain('1. Harry → Viktor: "Too quiet all day."');
        expect(ctx).toContain('2. Leo → Harry\n');
        expect(ctx).toContain('Result: Viktor eliminated (was villager)');
    });

    it('gives werewolves their attack history with the outcome but no cause', () => {
        const wolf = bot('Harry', GAME_ROLES.WEREWOLF, { attacks: [
            { day: 1, target: 'Viktor', outcome: 'killed' },
            { day: 2, target: 'Ron', outcome: 'survived' },
            { day: 3, target: 'Leo', outcome: 'failed' },
        ] });
        const ctx = generateBotContextSection(wolf, { ...game, currentDay: 4 } as Game);
        expect(ctx).toContain("Your Pack's Attack History");
        expect(ctx).toContain('Attacked **Viktor** → 💀 Viktor died');
        expect(ctx).toContain('Attacked **Ron** → ❌ Ron survived (the doctor protected them)');
        expect(ctx).toContain('Attacked **Leo** → ❌ Attack failed');
        expect(ctx).not.toMatch(/abduct|maniac/i);
    });

    it('tells the doctor a protection failed without naming the cause', () => {
        const doc = bot('Ron', GAME_ROLES.DOCTOR, { protections: [{ day: 1, target: 'Leo', success: false }] });
        const ctx = generateBotContextSection(doc, game);
        expect(ctx).toContain('Tried to protect **Leo** → ❌ Protection failed');
        expect(ctx).not.toMatch(/abduct/i);
    });
});

describe('bot prompt layout — stable through a day', () => {
    const bot = (name: string, role: string, extra: Partial<Bot> = {}): Bot =>
        ({ name, role, isAlive: true, story: `${name}'s story`, aiType: 'x', gender: 'male', voice: 'v', ...extra } as Bot);

    // Day 2, morning: day 1 is complete (vote, night story, chapter, the detective's result).
    const morning = (): Game => ({
        currentDay: 2,
        gameState: 'DAY_DISCUSSION',
        humanPlayerName: 'Leo',
        humanPlayerRole: GAME_ROLES.VILLAGER,
        bots: [
            bot('Mira', GAME_ROLES.DETECTIVE, {
                summary: 'Day 1 notes: Harry was too eager.',
                roleKnowledge: { investigations: [{ day: 1, target: 'Harry', isEvil: true }] },
            }),
            bot('Harry', GAME_ROLES.WEREWOLF),
            bot('Ron', GAME_ROLES.DOCTOR),
            bot('Viktor', GAME_ROLES.VILLAGER, { isAlive: false }),
        ],
        votingHistory: [{ day: 1, voteCounts: { Viktor: 2 }, votes: [], eliminatedPlayer: 'Viktor', eliminatedPlayerRole: 'villager' }],
        nightNarratives: [{ day: 1, narrative: 'Night one passes quietly.' }],
        storyChapters: [{ day: 1, summary: 'Chapter one: the well runs dry.' }],
        dayDiscussionSummaries: [{ day: 1, summary: 'The village argued about the well.' }],
    } as unknown as Game);

    // The same day after the vote and the night: Ron voted out, tonight's story and chapter
    // written, the detective's new result recorded, the GM's discussion summary added.
    const afterNight = (): Game => {
        const g = morning();
        g.bots = g.bots.map(b => b.name === 'Ron' ? { ...b, isAlive: false }
            : b.name === 'Mira' ? { ...b, roleKnowledge: { investigations: [...b.roleKnowledge!.investigations!, { day: 2, target: 'Ron', isEvil: false }] } }
            : b) as Bot[];
        (g as any).gameState = 'NEW_DAY_BOT_SUMMARIES';
        g.votingHistory = [...g.votingHistory!, { day: 2, voteCounts: { Ron: 3 }, votes: [], eliminatedPlayer: 'Ron', eliminatedPlayerRole: 'doctor' }] as any;
        g.nightNarratives = [...g.nightNarratives!, { day: 2, narrative: 'Night two: a scream by the mill.' }] as any;
        g.storyChapters = [...g.storyChapters!, { day: 2, summary: 'Chapter two: the mill burns.' }];
        g.dayDiscussionSummaries = [...g.dayDiscussionSummaries!, { day: 2, summary: 'Day two was all about Ron.' }];
        return g;
    };

    const mira = (g: Game) => g.bots.find(b => b.name === 'Mira')!;

    it('sends a byte-identical system prompt from the morning through the vote, the night and the summary', () => {
        const before = buildBotSystemPrompt(mira(morning()), morning());
        const after = buildBotSystemPrompt(mira(afterNight()), afterNight());
        expect(after).toBe(before);
    });

    it('keeps completed days in the system prompt and leaves today out of it', () => {
        const prompt = buildBotSystemPrompt(mira(afterNight()), afterNight());
        expect(prompt).toContain('Night one passes quietly.');
        expect(prompt).toContain('Chapter one: the well runs dry.');
        expect(prompt).toContain('Investigated **Harry** → 🔴 **EVIL**');
        expect(prompt).toContain('Day 1 notes: Harry was too eager.');
        expect(prompt).not.toContain('Night two');
        expect(prompt).not.toContain('Chapter two');
        expect(prompt).not.toContain('Ron eliminated');
        expect(prompt).not.toContain('Investigated **Ron**');
        expect(prompt).not.toContain('Alive Players');
    });

    it('carries the alive/dead lists and tonight\'s role result in the turn state', () => {
        const morningState = generateBotTurnState(mira(morning()), morning());
        expect(morningState).toContain('**Alive Players:** Harry, Ron, Leo');
        expect(morningState).toContain('**Dead Players:** Viktor (villager)');
        expect(morningState).not.toContain('Investigated');

        const nightState = generateBotTurnState(mira(afterNight()), afterNight());
        expect(nightState).toContain('**Alive Players:** Harry, Leo');
        expect(nightState).toContain('**Dead Players:** Ron (doctor), Viktor (villager)');
        expect(nightState).toContain('Your Detective Action Results (latest night)');
        expect(nightState).toContain('Investigated **Ron** → ✓ Innocent');
        expect(nightState).not.toContain('Investigated **Harry**');
    });

    it('moves the whole day into the system prompt the next morning', () => {
        const next = { ...afterNight(), currentDay: 3 } as Game;
        const prompt = buildBotSystemPrompt(mira(next), next);
        expect(prompt).toContain('Night two: a scream by the mill.');
        expect(prompt).toContain('Chapter two: the mill burns.');
        expect(prompt).toContain('Investigated **Ron** → ✓ Innocent');
        expect(generateBotTurnState(mira(next), next)).not.toContain('Investigated');
    });

    it('puts the state first, then the reminder that fits the turn', () => {
        const g = morning();
        const state = generateBotTurnState(mira(g), g);

        const table = buildBotTurnTail(mira(g), g, 'table');
        expect(table.startsWith(state)).toBe(true);
        expect(table).toContain('core playstyle');
        expect(table).toContain('RELATIONSHIP & CONVERSATION CONTINUITY');
        expect(table).toContain('NOT wrapped in quotation marks');

        // A night action is a private JSON choice: playstyle and decision reminder, no table talk.
        const night = buildBotTurnTail(mira(g), g, 'night');
        expect(night.startsWith(state)).toBe(true);
        expect(night).toContain('core playstyle');
        expect(night).toContain('DECISION-MAKING REMINDER');
        expect(night).not.toContain('CONVERSATION CONTINUITY');
        expect(night).not.toContain('quotation marks');

        expect(buildBotTurnTail(mira(g), g, 'summary')).toBe(state);

        const ja = { ...g, language: 'ja' } as Game;
        for (const kind of ['table', 'night', 'summary'] as const) {
            expect(buildBotTurnTail(mira(ja), ja, kind)).toMatch(/Reply in Japanese, never in English\.$/);
        }
    });

    it('says "none" when nobody has died', () => {
        const g = morning();
        g.bots = g.bots.map(b => ({ ...b, isAlive: true }));
        expect(generateBotTurnState(mira(g), g)).toContain('**Dead Players:** none');
    });
});

describe('getEffectiveModel — blocked providers', () => {
    const blocked = {
        modelOverride: null,
        providerBlocks: { GOOGLE_API_KEY: { provider: 'Google', reason: 'PROHIBITED_CONTENT', model: 'gemini-flash', day: 1, at: 1 } },
    } as unknown as Game;

    it('throws before any call when the stored model is on a blocked provider', () => {
        expect(() => getEffectiveModel(blocked, 'Marina', 'gemini-flash')).toThrow(/Google is blocked in this game/);
    });

    it('also refuses a one-shot override that lands on the blocked provider', () => {
        const withOverride = { ...blocked, modelOverride: { botName: 'Marina', model: 'gemini-pro' } } as unknown as Game;
        expect(() => getEffectiveModel(withOverride, 'Marina', 'muse-spark')).toThrow(/Google is blocked/);
    });

    it('passes other providers through, block list or not', () => {
        expect(getEffectiveModel(blocked, 'Marina', 'muse-spark')).toEqual({ aiType: 'muse-spark', enableThinking: false });
        expect(getEffectiveModel({ modelOverride: null } as unknown as Game, 'Marina', 'gemini-flash').aiType).toBe('gemini-flash');
    });
});
