
import { replayNight } from './night-actions';
import { db } from "@/firebase/server";
import { auth } from "@/auth";
import { GAME_STATES, Game, MessageType } from "@/app/api/game-models";

// Mock dependencies
jest.mock("@/firebase/server", () => ({
    db: {
        collection: jest.fn(),
        runTransaction: jest.fn()
    }
}));

jest.mock("@/auth", () => ({
    auth: jest.fn()
}));

jest.mock("./game-actions", () => ({
    getGame: jest.fn(),
    setGameErrorState: jest.fn().mockImplementation((gameId, error) => {
        return { errorState: error };
    })
}));

jest.mock("@/app/utils/tier-utils", () => ({
    getApiKeysForUser: jest.fn()
}));

jest.mock("@/app/api/tier-guards", () => ({
    ensureUserCanAccessGame: jest.fn()
}));

import { getGame } from "./game-actions";

describe('replayNight', () => {
    const mockGameId = 'test-game-id';
    const mockUserEmail = 'test@example.com';
    const currentDay = 2;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock auth
        (auth as jest.Mock).mockResolvedValue({
            user: { email: mockUserEmail }
        });
    });

    it('should clear night narratives for the current day', async () => {
        // Setup mock game state
        const mockGame: Partial<Game> = {
            id: mockGameId,
            gameState: GAME_STATES.NIGHT_RESULTS,
            currentDay: currentDay,
            createdWithTier: 'free',
            nightNarratives: [
                { day: 1, narrative: "Day 1 narrative" },
                { day: 2, narrative: "Day 2 narrative (to be cleared)" }
            ]
        };

        (getGame as jest.Mock).mockResolvedValue(mockGame);

        // Mock DB chain
        const mockGetMessages = jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ 
                ref: { delete: jest.fn() }, 
                data: () => ({ timestamp: 1000 }) 
            }],
            size: 1
        });

        const mockLimit = jest.fn().mockReturnValue({ get: mockGetMessages });
        const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
        
        // Helper to create a chainable query object
        const createQueryMock = () => {
            const queryMock: any = {
                where: jest.fn().mockReturnThis(),
                orderBy: mockOrderBy,
                limit: mockLimit,
                get: mockGetMessages
            };
            return queryMock;
        };

        const mockUpdate = jest.fn();
        const mockDoc = jest.fn().mockReturnValue({
            collection: jest.fn().mockImplementation((colName) => {
                if (colName === 'messages') {
                    return createQueryMock();
                }
                return {};
            }),
            update: mockUpdate,
            get: jest.fn()
        });

        (db.collection as jest.Mock).mockReturnValue({
            doc: mockDoc
        });

        // Execute replayNight
        await replayNight(mockGameId);

        // Verify update call
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            gameState: GAME_STATES.VOTE_RESULTS,
            nightResults: {},
            resolvedNightState: null,
            nightNarratives: [{ day: 1, narrative: "Day 1 narrative" }] // Day 2 should be removed
        }));
    });
});
