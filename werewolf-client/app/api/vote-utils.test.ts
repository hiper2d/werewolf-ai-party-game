import { selectEliminatedPlayer } from './vote-utils';

describe('selectEliminatedPlayer', () => {
    const HUMAN = 'Human Player';

    it('returns null when there are no votes', () => {
        expect(selectEliminatedPlayer({}, HUMAN)).toBeNull();
    });

    it('eliminates the single player with the most votes', () => {
        const votes = { Alice: 3, Bob: 1, [HUMAN]: 1 };
        expect(selectEliminatedPlayer(votes, HUMAN)).toBe('Alice');
    });

    it('eliminates the human when they have an outright vote majority', () => {
        const votes = { Alice: 1, [HUMAN]: 4 };
        expect(selectEliminatedPlayer(votes, HUMAN)).toBe(HUMAN);
    });

    it('breaks a tie between bots by random selection among the tied bots', () => {
        const votes = { Alice: 2, Bob: 2, Charlie: 1 };
        // random → 0 picks the first tied bot, → just under 1 picks the last
        expect(selectEliminatedPlayer(votes, HUMAN, () => 0)).toBe('Alice');
        expect(selectEliminatedPlayer(votes, HUMAN, () => 0.999)).toBe('Bob');
    });

    it('never eliminates the human on a tie-break', () => {
        const votes = { Alice: 2, [HUMAN]: 2 };
        // Whatever the random value, the human is excluded from the tie pool
        for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
            expect(selectEliminatedPlayer(votes, HUMAN, () => r)).toBe('Alice');
        }
    });

    it('picks among multiple tied bots when the human is also tied', () => {
        const votes = { Alice: 2, Bob: 2, [HUMAN]: 2, Charlie: 1 };
        expect(selectEliminatedPlayer(votes, HUMAN, () => 0)).toBe('Alice');
        expect(selectEliminatedPlayer(votes, HUMAN, () => 0.999)).toBe('Bob');
    });

    it('falls back to the first tied player when only the human is tied (degenerate case)', () => {
        const votes = { [HUMAN]: 2 };
        expect(selectEliminatedPlayer(votes, HUMAN)).toBe(HUMAN);
    });

    it('only the random value decides among tied bots — non-tied players are never picked', () => {
        const votes = { Alice: 3, Bob: 3, Charlie: 2, Dave: 1 };
        const picks = new Set(
            [0, 0.2, 0.4, 0.6, 0.8, 0.999].map(r => selectEliminatedPlayer(votes, HUMAN, () => r))
        );
        expect([...picks].sort()).toEqual(['Alice', 'Bob']);
    });
});
