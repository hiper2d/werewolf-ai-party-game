import {previewEdits} from './preview-edits';
import type {BotPreview, GamePreviewWithGeneratedBots} from '@/app/api/game-models';

const bot = (over: Partial<BotPreview> = {}): BotPreview => ({
    name: 'Mira', story: 'A healer.', playerAiType: 'claude', gender: 'female', voice: 'alloy',
    playStyle: 'cautious', visualDescription: 'red cloak', ...over,
});

const preview = (bots: BotPreview[], scene = 'Night falls.'): GamePreviewWithGeneratedBots => ({
    name: 'Alex', theme: 'Village', description: '', playerCount: bots.length + 1, werewolfCount: 1,
    specialRoles: [], humanPlayerRole: 'villager', gameMasterAiType: 'claude', playersAiType: ['claude'],
    scene, bots, voiceProvider: 'google', gameMasterVoice: 'Kore',
} as GamePreviewWithGeneratedBots);

describe('previewEdits', () => {
    it('reads an untouched preview as kept', () => {
        const p = preview([bot(), bot({name: 'Tomas'})]);
        expect(previewEdits(p, {...p, bots: p.bots.map(b => ({...b}))}))
            .toEqual({editedNames: 0, editedStories: 0, editedDetails: 0, editedScene: false});
    });

    it('counts bots whose name or story changed, and the opening story', () => {
        const base = preview([bot(), bot({name: 'Tomas'}), bot({name: 'Ines'})]);
        const edited = {
            ...base,
            scene: 'Night falls. Rain.',
            bots: [
                {...base.bots[0], name: 'Mirabel'},
                {...base.bots[1], story: 'A healer who lies.', name: 'Tom'},
                base.bots[2],
            ],
        };
        expect(previewEdits(base, edited))
            .toEqual({editedNames: 2, editedStories: 1, editedDetails: 0, editedScene: true});
    });

    it('counts play style, appearance, voice and voice direction as detail edits, once per bot', () => {
        const base = preview([bot(), bot({name: 'Tomas'})]);
        const edited = {
            ...base,
            bots: [
                {...base.bots[0], voice: 'echo', voiceStyle: 'whispering'},
                {...base.bots[1], playStyle: 'bold'},
            ],
        };
        expect(previewEdits(base, edited).editedDetails).toBe(2);
    });

    it('ignores model and thinking picks: they are not edits of the cast', () => {
        const base = preview([bot()]);
        const edited = {...base, gameMasterAiType: 'gpt', bots: [{...base.bots[0], playerAiType: 'gpt', enableThinking: true}]};
        expect(previewEdits(base, edited)).toEqual({editedNames: 0, editedStories: 0, editedDetails: 0, editedScene: false});
    });

    it('treats an absent and an empty optional field as the same value', () => {
        const base = preview([bot({voiceStyle: undefined})]);
        const edited = {...base, bots: [{...base.bots[0], voiceStyle: ''}]};
        expect(previewEdits(base, edited).editedDetails).toBe(0);
    });

    it('reads everything as kept without a baseline', () => {
        const p = preview([bot()]);
        expect(previewEdits(null, p)).toEqual({editedNames: 0, editedStories: 0, editedDetails: 0, editedScene: false});
    });
});
