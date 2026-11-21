import {GAME_ROLES} from "@/app/api/game-models";
import {
    dealStarterModels,
    dealStarterRoles,
    isIllustrationDocId,
    isStarterTemplateVisible,
    pickStarterGameMaster,
    pickStarterPortraitRound,
    renameHumanAvatarKey,
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
