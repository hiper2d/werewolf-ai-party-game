import { ensureUserCanAccessGame } from './tier-guards';
import { db } from '@/firebase/server';
import { TierMismatchError } from '@/app/api/errors';
import { getUserTier } from '@/app/api/user-actions';

jest.mock('@/firebase/server', () => ({
    db: {
        collection: jest.fn(),
    },
}));

jest.mock('@/app/api/user-actions', () => ({
    getUserTier: jest.fn(),
}));

const mockGetUserTier = getUserTier as jest.MockedFunction<typeof getUserTier>;

const USER = 'player@example.com';

function setupGameDoc(gameData: Record<string, any> | null): void {
    (db!.collection as jest.Mock).mockReturnValue({
        doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
                exists: gameData !== null,
                data: () => gameData,
            }),
        }),
    });
}

describe('ensureUserCanAccessGame', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows a free user into a free game', async () => {
        setupGameDoc({ createdWithTier: 'free', ownerEmail: USER });
        mockGetUserTier.mockResolvedValue('free');

        await expect(ensureUserCanAccessGame('game-1', USER)).resolves.toEqual({
            gameTier: 'free',
            userTier: 'free',
        });
    });

    it('throws TierMismatchError when a free user opens a paid game', async () => {
        setupGameDoc({ createdWithTier: 'paid', ownerEmail: USER });
        mockGetUserTier.mockResolvedValue('free');

        await expect(ensureUserCanAccessGame('game-1', USER)).rejects.toBeInstanceOf(TierMismatchError);
    });

    // The 'api' tier was retired 2026-08 with zero live users/games, but a doc written
    // before that could in principle still hold the string. It must coerce to 'free' —
    // the old cast made such a game permanently unopenable (mismatch on both tiers).
    it("coerces a stored legacy createdWithTier: 'api' to 'free' so the game stays openable", async () => {
        setupGameDoc({ createdWithTier: 'api', ownerEmail: USER });
        mockGetUserTier.mockResolvedValue('free');

        await expect(ensureUserCanAccessGame('game-1', USER)).resolves.toEqual({
            gameTier: 'free',
            userTier: 'free',
        });
    });
});
