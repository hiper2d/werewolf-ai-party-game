import {GAME_ROLES} from "@/app/api/game-models";
import {
    dealStarterModels,
    dealStarterRoles,
    isIllustrationDocId,
    isStarterTemplateVisible,
    pickStarterGameMaster,
    commonPortraitRounds,
    mentionsPlaceholder,
    starterClipKeyFor,
    starterClipUrl,
    STARTER_STORY_CLIP,
    parseStarterSceneDocId,
    pickStarterPortraitRound,
    pruneStyleSets,
    starterSceneDocId,
    renameHumanAvatarKey,
    resumableStarterGames,
    replacePlaceholderName,
    starterAvatarDocId,
} from "@/app/utils/starter-games";
import {getStarterGameMasterModels, getStarterModels, isStarterModel, turnCostRank} from "@/app/ai/model-limit-utils";
import {isAllowedAsGameMaster, LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {assertNoStarterRedraw, assertNoStarterRewind, assertStarterModels} from "@/app/utils/starter-limits";

/** A deterministic rng: cycles through the given values. */
const rngOf = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('replacePlaceholderName', () => {
    it('replaces the placeholder as a whole word, in its exact case', () => {
        expect(replacePlaceholderName('Rowan, sit. "Rowan?" Ask Rowan.', 'Rowan', 'Mira'))
            .toBe('Mira, sit. "Mira?" Ask Mira.');
    });

    it('leaves longer words and other cases alone', () => {
        expect(replacePlaceholderName('Rowanberry wine under the rowan tree, Rowan2 and McRowan', 'Rowan', 'Mira'))
            .toBe('Rowanberry wine under the rowan tree, Rowan2 and McRowan');
    });

    it('handles possessives and non-Latin names', () => {
        expect(replacePlaceholderName("Rowan's cloak", 'Rowan', 'Иван')).toBe("Иван's cloak");
        expect(replacePlaceholderName('Привет, Рябина! Рябинами не считается.', 'Рябина', 'Mira'))
            .toBe('Привет, Mira! Рябинами не считается.');
    });

    it('does not read the new name as a replacement pattern', () => {
        expect(replacePlaceholderName('Hi Rowan', 'Rowan', '$1$&')).toBe('Hi $1$&');
    });

    it('is a no-op for an empty placeholder or the same name', () => {
        expect(replacePlaceholderName('Hi Rowan', '', 'Mira')).toBe('Hi Rowan');
        expect(replacePlaceholderName('Hi Rowan', 'Rowan', 'Rowan')).toBe('Hi Rowan');
    });
});

describe('dealStarterRoles', () => {
    it('gives every wolf and special role to a bot and fills the rest with villagers', () => {
        const roles = dealStarterRoles(6, 2, [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE]);
        expect(roles).toHaveLength(6);
        expect(roles.filter(r => r === GAME_ROLES.WEREWOLF)).toHaveLength(2);
        expect(roles.filter(r => r === GAME_ROLES.DOCTOR)).toHaveLength(1);
        expect(roles.filter(r => r === GAME_ROLES.DETECTIVE)).toHaveLength(1);
        expect(roles.filter(r => r === GAME_ROLES.VILLAGER)).toHaveLength(2);
    });

    it('shuffles: different draws give different seats', () => {
        const a = dealStarterRoles(6, 2, [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE], rngOf(0));
        const b = dealStarterRoles(6, 2, [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE], rngOf(0.99));
        expect(a).not.toEqual(b);
    });

    it('refuses a template whose roles do not fit its bots', () => {
        expect(() => dealStarterRoles(3, 2, [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE])).toThrow(/don't fit/);
    });
});

describe('dealStarterModels', () => {
    it('uses every model once before any repeats', () => {
        const dealt = dealStarterModels(6, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        expect(new Set(dealt).size).toBe(6);
    });

    it('repeats only when there are more bots than models', () => {
        const dealt = dealStarterModels(5, ['a', 'b']);
        expect(dealt).toHaveLength(5);
        expect(new Set(dealt.slice(0, 2)).size).toBe(2);
    });

    it('throws with no models', () => {
        expect(() => dealStarterModels(3, [])).toThrow();
    });
});

describe('pickStarterGameMaster', () => {
    it("keeps the template's Game Master while it is eligible", () => {
        expect(pickStarterGameMaster('b', ['a', 'b'])).toBe('b');
    });
    it('deals one when the preferred model left the group', () => {
        expect(pickStarterGameMaster('z', ['a', 'b'], rngOf(0.6))).toBe('b');
        expect(pickStarterGameMaster(undefined, ['a', 'b'], rngOf(0))).toBe('a');
    });
});

describe('avatar keys', () => {
    it("renames only the human's docs", () => {
        expect(starterAvatarDocId('Rowan', 'Rowan', 'Mira')).toBe('Mira');
        expect(starterAvatarDocId('Rowan__2', 'Rowan', 'Mira')).toBe('Mira__2');
        expect(starterAvatarDocId('Rowanda', 'Rowan', 'Mira')).toBe('Rowanda');
        expect(starterAvatarDocId('Rowanda__0', 'Rowan', 'Mira')).toBe('Rowanda__0');
        expect(starterAvatarDocId('sheet-0', 'Rowan', 'Mira')).toBe('sheet-0');
        expect(starterAvatarDocId('scene-welcome', 'Rowan', 'Mira')).toBe('scene-welcome');
    });

    it("renames the human's key in a per-key map", () => {
        expect(renameHumanAvatarKey({Rowan: 1, Elda: 2}, 'Rowan', 'Mira')).toEqual({Mira: 1, Elda: 2});
        expect(renameHumanAvatarKey(undefined, 'Rowan', 'Mira')).toEqual({});
    });

    it('spots mid-game illustrations', () => {
        expect(isIllustrationDocId('illustration-night-1')).toBe(true);
        expect(isIllustrationDocId('illustration-day-2')).toBe(true);
        expect(isIllustrationDocId('scene-welcome')).toBe(false);
    });
});

describe('starter models', () => {
    it('are exactly the cheapest cost group', () => {
        const models = getStarterModels();
        expect(models.length).toBeGreaterThanOrEqual(6); // one distinct model per bot at a 7-player table
        for (const model of models) {
            expect(turnCostRank(model)).toBe(0);
            expect(SupportedAiModels[model].freeTier?.maxBotsPerGame).toBe(-1);
        }
        expect(isStarterModel(LLM_CONSTANTS.RANDOM)).toBe(false);
        expect(isStarterModel('no-such-model')).toBe(false);
    });

    it('include at least one that can be the Game Master', () => {
        const gms = getStarterGameMasterModels();
        expect(gms.length).toBeGreaterThan(0);
        for (const model of gms) expect(isAllowedAsGameMaster(model)).toBe(true);
    });
});

describe('starter limits', () => {
    const starter = {starterTemplateId: 'tavern'};
    const expensive = Object.keys(SupportedAiModels).find(m => m !== LLM_CONSTANTS.RANDOM && turnCostRank(m) > 0)!;

    it('hold a starter game to the cheapest group', () => {
        expect(() => assertStarterModels(starter, [getStarterModels()[0]])).not.toThrow();
        expect(() => assertStarterModels(starter, [getStarterModels()[0], expensive])).toThrow(/not available in a starter game/);
    });

    it('leave ordinary games alone', () => {
        expect(() => assertStarterModels({}, [expensive])).not.toThrow();
        expect(() => assertStarterModels(undefined, [expensive])).not.toThrow();
        expect(() => assertNoStarterRewind({})).not.toThrow();
        expect(() => assertNoStarterRedraw(null)).not.toThrow();
    });

    it('refuse rewinds and redraws in a starter game', () => {
        expect(() => assertNoStarterRewind(starter)).toThrow(/starter game/);
        expect(() => assertNoStarterRedraw(starter)).toThrow(/starter game/);
    });
});

describe('pickStarterPortraitRound', () => {
    it('picks one round every character has', () => {
        const variants = {A: {n: 3, sel: 2}, B: {n: 3, sel: 0}, 'game-master': {n: 3, sel: 1}};
        expect(pickStarterPortraitRound(variants, rngOf(0))).toBe(0);
        expect(pickStarterPortraitRound(variants, rngOf(0.5))).toBe(1);
        expect(pickStarterPortraitRound(variants, rngOf(0.99))).toBe(2);
    });

    it('stays inside the window of rounds still stored', () => {
        // Four draws with a cap of three: round 0 was dropped.
        const variants = {A: {n: 4, sel: 3, first: 1}, B: {n: 4, sel: 3, first: 1}};
        expect(pickStarterPortraitRound(variants, rngOf(0))).toBe(1);
        expect(pickStarterPortraitRound(variants, rngOf(0.99))).toBe(3);
    });

    it('returns undefined with no variants or no round in common', () => {
        expect(pickStarterPortraitRound(undefined)).toBeUndefined();
        expect(pickStarterPortraitRound({})).toBeUndefined();
        expect(pickStarterPortraitRound({A: {n: 1, sel: 0}, B: {n: 3, sel: 2, first: 2}})).toBeUndefined();
    });
});

describe('isStarterTemplateVisible', () => {
    it('shows only live templates in production', () => {
        expect(isStarterTemplateVisible('live', true)).toBe(true);
        expect(isStarterTemplateVisible('draft', true)).toBe(false);
        expect(isStarterTemplateVisible(undefined, true)).toBe(false);
    });
    it('shows drafts too outside production', () => {
        expect(isStarterTemplateVisible('draft', false)).toBe(true);
        expect(isStarterTemplateVisible('live', false)).toBe(true);
        expect(isStarterTemplateVisible('archived', false)).toBe(false);
    });
});

describe('style sets', () => {
    const anime = {label: 'anime', artStyle: 'cel-shaded anime'};
    const real = {label: 'realism', artStyle: 'photorealistic oil painting'};

    it('picks only among styled rounds when the template has any', () => {
        // Round 0 is the source game's own set; rounds 1 and 2 were drawn as styles.
        const variants = {A: {n: 3, sel: 2}, B: {n: 3, sel: 2}};
        const styleSets = {'1': anime, '2': real};
        expect(pickStarterPortraitRound(variants, rngOf(0), styleSets)).toBe(1);
        expect(pickStarterPortraitRound(variants, rngOf(0.99), styleSets)).toBe(2);
        // No styles: every common round is eligible, as before.
        expect(pickStarterPortraitRound(variants, rngOf(0), {})).toBe(0);
    });

    it('ignores a style whose round is outside the stored window', () => {
        const variants = {A: {n: 4, sel: 3, first: 1}, B: {n: 4, sel: 3, first: 1}};
        expect(pickStarterPortraitRound(variants, rngOf(0), {'0': anime, '3': real})).toBe(3);
        expect(pruneStyleSets({'0': anime, '3': real}, variants)).toEqual({'3': real});
        expect(pruneStyleSets({'0': anime}, undefined)).toEqual({});
    });

    it('reports the rounds the whole cast has in common', () => {
        expect(commonPortraitRounds({A: {n: 3, sel: 0}, B: {n: 2, sel: 0}})).toEqual({from: 0, to: 2});
        expect(commonPortraitRounds({A: {n: 1, sel: 0}, B: {n: 3, sel: 2, first: 2}})).toBeUndefined();
        expect(commonPortraitRounds({})).toBeUndefined();
    });

    it('names and parses per-style scene docs', () => {
        expect(starterSceneDocId('scene-welcome', 2)).toBe('scene-welcome__2');
        expect(parseStarterSceneDocId('scene-welcome__2')).toEqual({sceneKey: 'scene-welcome', round: 2});
        expect(parseStarterSceneDocId('scene-night__10')).toEqual({sceneKey: 'scene-night', round: 10});
        expect(parseStarterSceneDocId('scene-welcome')).toBeNull();
        expect(parseStarterSceneDocId('Rowan__2')).toBeNull();
        expect(parseStarterSceneDocId('sheet-2')).toBeNull();
    });
});

describe('voice clips', () => {
    it('knows whether a line names the human', () => {
        expect(mentionsPlaceholder('Welcome, Rowan.', 'Rowan')).toBe(true);
        expect(mentionsPlaceholder('Under the rowan tree, Rowanberry wine.', 'Rowan')).toBe(false);
        expect(mentionsPlaceholder('Anything', '')).toBe(false);
    });

    it('maps the opening story and the introductions to clip keys', () => {
        expect(starterClipKeyFor({messageType: 'GAME_STORY', authorName: 'Game Master', day: 1}, 'Game Master')).toBe(STARTER_STORY_CLIP);
        expect(starterClipKeyFor({messageType: 'BOT_WELCOME', authorName: 'Elda', day: 1}, 'Game Master')).toBe('Elda');
        // Later days and every other line are read live.
        expect(starterClipKeyFor({messageType: 'GAME_STORY', authorName: 'Game Master', day: 2}, 'Game Master')).toBeNull();
        expect(starterClipKeyFor({messageType: 'BOT_ANSWER', authorName: 'Elda', day: 1}, 'Game Master')).toBeNull();
        expect(starterClipKeyFor({messageType: 'NIGHT_SUMMARY', authorName: 'Game Master', day: 1}, 'Game Master')).toBeNull();
    });

    it('gives the clip URL only for a starter game, an existing clip and an unchanged voice', () => {
        const game = {starterTemplateId: 'tavern', starterClips: {Elda: {voice: 'Kore', version: 7}}};
        expect(starterClipUrl(game, 'Elda', 'Kore')).toBe('/api/starter-games/tavern/audio/Elda?v=7');
        expect(starterClipUrl(game, 'Elda', 'Puck')).toBeUndefined();      // the player changed her voice
        expect(starterClipUrl(game, 'Borin', 'Kore')).toBeUndefined();     // no clip (the line named the human)
        expect(starterClipUrl(game, null, 'Kore')).toBeUndefined();
        expect(starterClipUrl({starterClips: game.starterClips}, 'Elda', 'Kore')).toBeUndefined(); // not a starter game
        expect(starterClipUrl({starterTemplateId: 'tavern', starterClips: {'Иван': {voice: 'Kore', version: 1}}}, 'Иван', 'Kore'))
            .toBe('/api/starter-games/tavern/audio/%D0%98%D0%B2%D0%B0%D0%BD?v=1');
    });
});

describe('resumableStarterGames', () => {
    it("gives each template the player's newest unfinished game", () => {
        expect(resumableStarterGames([
            {id: 'tavern-1', starterTemplateId: 'tavern', gameState: 'DAY_DISCUSSION', createdAt: 1},
            {id: 'tavern-3', starterTemplateId: 'tavern', gameState: 'GAME_OVER', createdAt: 3},
            {id: 'tavern-2', starterTemplateId: 'tavern', gameState: 'NIGHT', createdAt: 2},
            {id: 'ship-1', starterTemplateId: 'starship', gameState: 'VOTE', createdAt: 5},
            {id: 'own-1', gameState: 'DAY_DISCUSSION', createdAt: 9},
        ])).toEqual({tavern: 'tavern-2', starship: 'ship-1'});
    });

    it('is empty when every starter game is over or there are none', () => {
        expect(resumableStarterGames([{id: 'a', starterTemplateId: 'tavern', gameState: 'GAME_OVER', createdAt: 1}])).toEqual({});
        expect(resumableStarterGames([])).toEqual({});
    });
});
