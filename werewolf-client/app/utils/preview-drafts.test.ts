import {MAX_PREVIEW_DRAFT_CHARS, castKeyOf, parsePreviewDraft, previewCastKey, previewDraftSummaryFields, previewDraftsToEvict, serializePreviewDraft} from './preview-drafts';

const payload = () => ({
    form: {name: 'Alex', theme: 'Tavern', description: '', language: 'en', artStyle: '', playerCount: 3, werewolfCount: 1,
        specialRoles: [], humanPlayerRole: 'random', longReplies: false, gameMode: 'roleplay', gameMasterAiType: 'random',
        voiceProvider: 'google', playersAiType: ['random']},
    preview: {name: 'Alex', theme: 'Tavern', scene: 'A storm.', language: 'ja', optional: undefined,
        bots: [{name: 'Mira', story: 's'}, {name: 'Odo', story: 't'}]},
    baseline: null,
}) as any;

describe('preview drafts', () => {
    it('round-trips a preview, dropping undefined fields', () => {
        const json = serializePreviewDraft(payload());
        expect(json).not.toBeNull();
        const back = parsePreviewDraft(json);
        expect(back?.preview.bots.map((b: any) => b.name)).toEqual(['Mira', 'Odo']);
        expect(back?.form.theme).toBe('Tavern');
        expect(back?.baseline).toBeNull();
    });

    it('refuses what is not a preview', () => {
        expect(serializePreviewDraft(null)).toBeNull();
        expect(serializePreviewDraft({form: {name: 'a', theme: 'b'}})).toBeNull();
        expect(serializePreviewDraft({...payload(), preview: {scene: 'x', bots: []}})).toBeNull();
        expect(parsePreviewDraft('not json')).toBeNull();
        expect(parsePreviewDraft('{"form":{}}')).toBeNull();
        expect(parsePreviewDraft(undefined)).toBeNull();
    });

    it('refuses a payload over the size limit', () => {
        const big = payload();
        big.preview.scene = 'x'.repeat(MAX_PREVIEW_DRAFT_CHARS);
        expect(serializePreviewDraft(big)).toBeNull();
    });

    it('builds the list row from the preview', () => {
        expect(previewDraftSummaryFields(payload())).toEqual({castKey: 'Alex|Mira|Odo|game-master', theme: 'Tavern', name: 'Alex', players: 3, language: 'ja'});
    });

    it('gives one cast key whatever the order', () => {
        expect(castKeyOf(['Odo', 'game-master', 'Alex', 'Mira'])).toBe(previewCastKey(payload().preview));
    });

    it('evicts the oldest drafts past the limit', () => {
        const drafts = [{id: 'a', updatedAt: 1}, {id: 'b', updatedAt: 3}, {id: 'c', updatedAt: 2}];
        expect(previewDraftsToEvict(drafts, 2)).toEqual(['a']);
        expect(previewDraftsToEvict(drafts, 3)).toEqual([]);
    });
});
