import { recordFeatureEvent, listFeatureEventsSince, FEATURE_EVENTS_COLLECTION } from './feature-events';
import { db } from '@/firebase/server';
import { logger } from '@/app/utils/logger';

jest.mock('@/app/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/firebase/server', () => ({
    db: { collection: jest.fn() },
}));

describe('recordFeatureEvent', () => {
    const add = jest.fn();
    beforeEach(() => {
        jest.clearAllMocks();
        (db!.collection as jest.Mock).mockReturnValue({ add });
        add.mockResolvedValue({ id: 'ev1' });
    });

    it('writes a flat row with the user, feature, game, detail and a TTL', async () => {
        const before = Date.now();
        await recordFeatureEvent({ userId: 'a@b.c', feature: 'avatar_reframe', gameId: 'g1', detail: { key: 'Nefer', target: 'card' } });
        expect(db!.collection).toHaveBeenCalledWith(FEATURE_EVENTS_COLLECTION);
        const row = add.mock.calls[0][0];
        expect(row).toMatchObject({ userId: 'a@b.c', feature: 'avatar_reframe', gameId: 'g1', detail: { key: 'Nefer', target: 'card' } });
        expect(row.createdAt).toBeGreaterThanOrEqual(before);
        expect(row.expireAt.getTime() - row.createdAt).toBe(180 * 24 * 60 * 60 * 1000);
    });

    it('leaves out an absent game and detail instead of writing undefined fields', async () => {
        await recordFeatureEvent({ userId: 'a@b.c', feature: 'draft_illustrations' });
        const row = add.mock.calls[0][0];
        expect('gameId' in row).toBe(false);
        expect('detail' in row).toBe(false);
    });

    it('logs the feature and game to Better Stack without the user', async () => {
        await recordFeatureEvent({ userId: 'a@b.c', feature: 'avatar_reroll', gameId: 'g1' });
        expect(logger.info).toHaveBeenCalledWith('FEATURE_USED: avatar_reroll', { feature: 'avatar_reroll', gameId: 'g1' });
        const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
        expect(logged).not.toContain('a@b.c');
    });

    it('never throws when the write fails', async () => {
        add.mockRejectedValue(new Error('quota'));
        await expect(recordFeatureEvent({ userId: 'a@b.c', feature: 'avatar_reroll', gameId: 'g1' })).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('Feature event not saved', expect.objectContaining({ error: 'quota' }));
    });
});

describe('listFeatureEventsSince', () => {
    it('returns rows since the moment, oldest first, with their ids', async () => {
        const get = jest.fn().mockResolvedValue({ docs: [{ id: 'x', data: () => ({ userId: 'u', feature: 'avatar_reroll', createdAt: 5 }) }] });
        const orderBy = jest.fn().mockReturnValue({ get });
        const where = jest.fn().mockReturnValue({ orderBy });
        (db!.collection as jest.Mock).mockReturnValue({ where });
        const rows = await listFeatureEventsSince(1);
        expect(where).toHaveBeenCalledWith('createdAt', '>=', 1);
        expect(orderBy).toHaveBeenCalledWith('createdAt', 'asc');
        expect(rows).toEqual([{ id: 'x', userId: 'u', feature: 'avatar_reroll', createdAt: 5 }]);
    });
});
