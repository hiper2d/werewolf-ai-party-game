/**
 * Portrait redraw allowance: free games get FREE_TIER_AVATAR_REGENS redraws,
 * enforced inside the claim transaction (so two tabs can't spend one
 * allowance twice); paid games are unlimited.
 */

import { runAvatarRegeneration } from './avatar-generation';
import { FREE_TIER_AVATAR_REGENS, Game } from '@/app/api/game-models';

let gameDoc: Record<string, any> | null = null;
const txUpdate = jest.fn();
const refUpdate = jest.fn();

jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(() => ({
            doc: jest.fn(() => ({
                id: 'game-1',
                get: async () => ({ exists: gameDoc !== null, data: () => gameDoc }),
                update: refUpdate,
                collection: jest.fn(() => ({ doc: jest.fn(() => ({ get: async () => ({ exists: false }) })) })),
            })),
        })),
        runTransaction: jest.fn(async (fn: any) => fn({
            get: async () => ({ id: 'game-1', exists: gameDoc !== null, data: () => gameDoc }),
            update: txUpdate,
        })),
    },
}));
jest.mock('firebase-admin', () => ({
    firestore: { FieldValue: { increment: jest.fn((n: number) => ({ __inc: n })) }, FieldPath: jest.fn() },
}));
// No Google key: a claimed run fails fast after the claim, which is all these tests need.
jest.mock('@/app/utils/tier-utils', () => ({ getUserTierAndApiKeys: jest.fn(async () => ({ tier: 'free', apiKeys: {} })) }));
jest.mock('@/app/api/user-actions', () => ({ updateUserMonthlySpending: jest.fn(), deductBalance: jest.fn() }));
jest.mock('@/app/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const OWNER = 'owner@example.com';
const game = (overrides: Partial<Game> = {}): Record<string, any> => ({
    ownerEmail: OWNER,
    avatarsStatus: 'ready',
    avatarRegenCount: 0,
    avatarVariants: { Mina: { n: 1, sel: 0 } },
    theme: 'Dracula', description: '', humanPlayerName: 'Bob',
    bots: [{ name: 'Mina', gender: 'female', story: '' }],
    ...overrides,
});

beforeEach(() => {
    gameDoc = null;
    txUpdate.mockClear();
    refUpdate.mockClear();
});

describe('runAvatarRegeneration allowance', () => {
    it('free game: the first redraw is claimed', async () => {
        gameDoc = game({ avatarRegenCount: 0 });
        await runAvatarRegeneration('game-1', OWNER, FREE_TIER_AVATAR_REGENS);
        expect(txUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ avatarsRegeneratingAt: expect.any(Number) }));
    });

    it('free game: a second redraw is refused before anything is drawn', async () => {
        gameDoc = game({ avatarRegenCount: FREE_TIER_AVATAR_REGENS });
        const result = await runAvatarRegeneration('game-1', OWNER, FREE_TIER_AVATAR_REGENS);
        expect(result).toBeNull();
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('paid game: the same count is not a limit', async () => {
        gameDoc = game({ avatarRegenCount: FREE_TIER_AVATAR_REGENS });
        await runAvatarRegeneration('game-1', OWNER, Number.MAX_SAFE_INTEGER);
        expect(txUpdate).toHaveBeenCalled();
    });

    it('refuses non-owners, games without portraits, and a redraw already in flight', async () => {
        gameDoc = game();
        expect(await runAvatarRegeneration('game-1', 'someone@else.com', 5)).toBeNull();
        gameDoc = game({ avatarsStatus: 'generating' });
        expect(await runAvatarRegeneration('game-1', OWNER, 5)).toBeNull();
        gameDoc = game({ avatarsRegeneratingAt: Date.now() - 1000 });
        expect(await runAvatarRegeneration('game-1', OWNER, 5)).toBeNull();
        expect(txUpdate).not.toHaveBeenCalled();
    });
});
