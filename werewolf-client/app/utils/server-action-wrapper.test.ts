/**
 * Unit tests for the global server-action error-handling wrapper.
 *
 * Pins current behavior of withErrorHandling / withGameErrorHandling:
 * success passthrough, error → SystemErrorMessage conversion via
 * setGameErrorState, tier-mismatch rethrow, and bot/model attribution.
 */
import { withErrorHandling, withGameErrorHandling } from '@/app/utils/server-action-wrapper';
import {
  BotResponseError,
  GAME_STATES,
  GameActionResponse,
  SystemErrorMessage,
} from '@/app/api/game-models';
import { TierMismatchError } from '@/app/api/errors';
import { setGameErrorState, getGame } from '@/app/api/game-actions';
import { logger } from '@/app/utils/logger';

jest.mock('@/app/api/game-actions', () => ({
  setGameErrorState: jest.fn(),
  getGame: jest.fn(),
}));

jest.mock('@/app/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockSetGameErrorState = setGameErrorState as jest.MockedFunction<typeof setGameErrorState>;
const mockGetGame = getGame as jest.MockedFunction<typeof getGame>;

const GAME_ID = 'game-123';

// Minimal game object — only the fields the wrapper reads.
function makeGame(overrides: Record<string, any> = {}): any {
  return {
    id: GAME_ID,
    gameState: GAME_STATES.DAY_DISCUSSION,
    gameStateParamQueue: [],
    gameStateProcessQueue: [],
    gameMasterAiType: 'gm-model-x',
    bots: [
      { name: 'Alice', aiType: 'model-alice' },
      { name: 'Bob', aiType: 'model-bob' },
    ],
    ...overrides,
  };
}

const ERROR_GAME = makeGame({ errorState: { error: 'persisted' } });

function lastErrorStateCall(): { gameId: string; systemError: SystemErrorMessage } {
  expect(mockSetGameErrorState).toHaveBeenCalledTimes(1);
  const [gameId, systemError] = mockSetGameErrorState.mock.calls[0];
  return { gameId, systemError };
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGame.mockResolvedValue(makeGame());
  mockSetGameErrorState.mockResolvedValue(ERROR_GAME);
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('withErrorHandling', () => {
  describe('success passthrough', () => {
    it('returns the wrapped function result untouched and writes no error state', async () => {
      const result: GameActionResponse = {
        game: makeGame(),
        messages: [{ id: 'm1' } as any],
      };
      const fn = jest.fn(async (_gameId: string) => result);
      const wrapped = withErrorHandling(fn, (gameId) => gameId);

      const actual = await wrapped(GAME_ID);

      expect(actual).toBe(result); // same reference, untouched
      expect(fn).toHaveBeenCalledWith(GAME_ID);
      expect(mockSetGameErrorState).not.toHaveBeenCalled();
      expect(mockGetGame).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('generic Error conversion', () => {
    it('writes a SystemErrorMessage with message, stack as details, recoverable=true and context metadata', async () => {
      const boom = new Error('something exploded');
      async function namedAction(_gameId: string): Promise<GameActionResponse> {
        throw boom;
      }
      const wrapped = withErrorHandling(namedAction, (gameId) => gameId);

      const before = Date.now();
      const response = await wrapped(GAME_ID);
      const after = Date.now();

      const { gameId, systemError } = lastErrorStateCall();
      expect(gameId).toBe(GAME_ID);
      expect(systemError.error).toBe('something exploded');
      expect(systemError.details).toBe(boom.stack);
      expect(systemError.recoverable).toBe(true);
      expect(systemError.context.function).toBe('namedAction');
      expect(systemError.context.gameId).toBe(GAME_ID);
      expect(typeof systemError.context.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(systemError.context.timestamp))).toBe(false);
      expect(systemError.timestamp).toBeGreaterThanOrEqual(before);
      expect(systemError.timestamp).toBeLessThanOrEqual(after);

      // Wrapper returns the setGameErrorState result with empty messages
      expect(response).toEqual({ game: ERROR_GAME, messages: [] });
      expect(response.game).toBe(ERROR_GAME);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('falls back to error.message as details when the Error has no stack', async () => {
      const boom = new Error('no stack here');
      delete (boom as any).stack;
      const wrapped = withErrorHandling(async () => { throw boom; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.details).toBe('no stack here');
    });

    it('handles non-Error throwables with a generic message and String(error) details', async () => {
      const wrapped = withErrorHandling(async () => { throw 'string failure'; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.error).toBe('Unknown system error occurred');
      expect(systemError.details).toBe('string failure');
      expect(systemError.recoverable).toBe(true);
    });
  });

  describe('BotResponseError handling', () => {
    it('honors details, context and recoverable from the BotResponseError', async () => {
      const botError = new BotResponseError(
        'bot refused to answer',
        'raw provider payload',
        { apiProvider: 'openai', customKey: 'custom-value' },
        false
      );
      const wrapped = withErrorHandling(async () => { throw botError; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.error).toBe('bot refused to answer');
      expect(systemError.details).toBe('raw provider payload');
      expect(systemError.recoverable).toBe(false);
      // BotResponseError context is merged into the stored context
      expect(systemError.context.apiProvider).toBe('openai');
      expect(systemError.context.customKey).toBe('custom-value');
    });

    it('keeps empty-string details from a BotResponseError instead of substituting the stack', async () => {
      const botError = new BotResponseError('terse failure'); // details default ''
      const wrapped = withErrorHandling(async () => { throw botError; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.details).toBe('');
      expect(systemError.recoverable).toBe(true);
    });
  });

  describe('tier mismatch errors', () => {
    it('rethrows TierMismatchError instances without writing error state', async () => {
      const tierError = new TierMismatchError(GAME_ID, 'paid', 'free');
      const wrapped = withErrorHandling(async () => { throw tierError; }, () => GAME_ID);

      await expect(wrapped()).rejects.toBe(tierError);
      expect(mockSetGameErrorState).not.toHaveBeenCalled();
      expect(mockGetGame).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('rethrows duck-typed tier mismatch errors (code === TIER_MISMATCH)', async () => {
      const duckTyped = Object.assign(new Error('TIER_MISMATCH'), { code: 'TIER_MISMATCH' });
      const wrapped = withErrorHandling(async () => { throw duckTyped; }, () => GAME_ID);

      await expect(wrapped()).rejects.toBe(duckTyped);
      expect(mockSetGameErrorState).not.toHaveBeenCalled();
    });
  });

  describe('error attribution', () => {
    it('prefers context.agentName over the queue head for botName and context.model for model', async () => {
      mockGetGame.mockResolvedValue(makeGame({
        gameState: GAME_STATES.DAY_DISCUSSION,
        gameStateProcessQueue: ['Bob'],
      }));
      const botError = new BotResponseError('agent failed', 'd', {
        agentName: 'Alice',
        model: 'explicit-model',
      });
      const wrapped = withErrorHandling(async () => { throw botError; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context.botName).toBe('Alice');
      expect(systemError.context.model).toBe('explicit-model');
    });

    it('falls back to context.botName when agentName is absent', async () => {
      const botError = new BotResponseError('agent failed', 'd', { botName: 'Bob' });
      const wrapped = withErrorHandling(async () => { throw botError; }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context.botName).toBe('Bob');
      // model resolved from game.bots by name
      expect(systemError.context.model).toBe('model-bob');
    });

    it('uses gameStateParamQueue[0] as botName when game is in WELCOME state', async () => {
      mockGetGame.mockResolvedValue(makeGame({
        gameState: GAME_STATES.WELCOME,
        gameStateParamQueue: ['Alice', 'Bob'],
        gameStateProcessQueue: ['Bob'],
      }));
      const wrapped = withErrorHandling(async () => { throw new Error('boom'); }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context.botName).toBe('Alice');
      expect(systemError.context.model).toBe('model-alice');
      expect(systemError.context.gameState).toBe(GAME_STATES.WELCOME);
    });

    it('uses gameStateProcessQueue[0] as botName for non-WELCOME states', async () => {
      mockGetGame.mockResolvedValue(makeGame({
        gameState: GAME_STATES.VOTE,
        gameStateParamQueue: ['Alice'],
        gameStateProcessQueue: ['Bob', 'Alice'],
      }));
      const wrapped = withErrorHandling(async () => { throw new Error('boom'); }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context.botName).toBe('Bob');
      expect(systemError.context.model).toBe('model-bob');
      expect(systemError.context.gameState).toBe(GAME_STATES.VOTE);
    });

    it('resolves the Game Master model from gameMasterAiType', async () => {
      mockGetGame.mockResolvedValue(makeGame({
        gameState: GAME_STATES.NIGHT,
        gameStateProcessQueue: ['Game Master'],
      }));
      const wrapped = withErrorHandling(async () => { throw new Error('gm boom'); }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context.botName).toBe('Game Master');
      expect(systemError.context.model).toBe('gm-model-x');
    });

    it('omits botName/model/gameState from context when they cannot be resolved', async () => {
      mockGetGame.mockResolvedValue(makeGame({
        gameState: undefined,
        gameStateParamQueue: [],
        gameStateProcessQueue: [],
      }));
      const wrapped = withErrorHandling(async () => { throw new Error('boom'); }, () => GAME_ID);

      await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.context).not.toHaveProperty('botName');
      expect(systemError.context).not.toHaveProperty('model');
      expect(systemError.context).not.toHaveProperty('gameState');
    });

    it('still writes the original error state when getGame fails during attribution', async () => {
      mockGetGame.mockRejectedValue(new Error('firestore down'));
      const wrapped = withErrorHandling(async () => { throw new Error('original failure'); }, () => GAME_ID);

      const response = await wrapped();

      const { systemError } = lastErrorStateCall();
      expect(systemError.error).toBe('original failure');
      // No attribution available, but error is not masked
      expect(systemError.context).not.toHaveProperty('botName');
      expect(systemError.context).not.toHaveProperty('model');
      expect(response).toEqual({ game: ERROR_GAME, messages: [] });
    });
  });

  describe('gameId extraction', () => {
    it('uses the gameIdExtractor to pick the gameId from arbitrary argument shapes', async () => {
      const wrapped = withErrorHandling(
        async (_a: number, _opts: { gameId: string }) => { throw new Error('boom'); },
        (_a, opts) => opts.gameId
      );

      await wrapped(42, { gameId: 'extracted-id' });

      expect(mockGetGame).toHaveBeenCalledWith('extracted-id');
      const { gameId, systemError } = lastErrorStateCall();
      expect(gameId).toBe('extracted-id');
      expect(systemError.context.gameId).toBe('extracted-id');
    });
  });
});

describe('withGameErrorHandling', () => {
  it('treats the first argument as the gameId', async () => {
    const wrapped = withGameErrorHandling(
      async (_gameId: string, _other: string) => { throw new Error('boom'); }
    );

    await wrapped('first-arg-game', 'something-else');

    expect(mockGetGame).toHaveBeenCalledWith('first-arg-game');
    const { gameId } = lastErrorStateCall();
    expect(gameId).toBe('first-arg-game');
  });

  it('passes through successful results unchanged', async () => {
    const result: GameActionResponse = { game: makeGame(), messages: [] };
    const wrapped = withGameErrorHandling(async (_gameId: string) => result);

    await expect(wrapped(GAME_ID)).resolves.toBe(result);
    expect(mockSetGameErrorState).not.toHaveBeenCalled();
  });
});
