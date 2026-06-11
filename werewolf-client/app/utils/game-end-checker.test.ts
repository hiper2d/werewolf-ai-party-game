import { GameEndChecker, WinConditionResult } from './game-end-checker';
import { Bot, Game, GAME_ROLES } from '@/app/api/game-models';

/**
 * Compact fixture helpers.
 *
 * The checkers only read: bots (name, role, isAlive), humanPlayerName and
 * humanPlayerRole. Everything else is filled with sane defaults so the
 * fixtures satisfy the full Game/Bot types without noise in the tests.
 */
function makeBot(name: string, role: string, isAlive: boolean = true): Bot {
    return {
        name,
        story: `${name}'s story`,
        role,
        isAlive,
        aiType: 'mock-ai',
        gender: 'female',
        voice: 'nova',
        playStyle: 'normal'
    };
}

interface GameSetup {
    bots?: Bot[];
    humanPlayerName?: string;
    humanPlayerRole?: string;
}

function makeGame({
    bots = [],
    humanPlayerName = 'Human',
    humanPlayerRole = GAME_ROLES.VILLAGER
}: GameSetup = {}): Game {
    return {
        id: 'test-game-id',
        description: 'test game',
        theme: 'test theme',
        werewolfCount: bots.filter(b => b.role === GAME_ROLES.WEREWOLF).length,
        specialRoles: [],
        gameMasterAiType: 'mock-ai',
        gameMasterVoice: 'onyx',
        story: 'test story',
        bots,
        humanPlayerName,
        humanPlayerRole,
        currentDay: 1,
        gameState: 'DAY_DISCUSSION',
        gameStateParamQueue: [],
        gameStateProcessQueue: [],
        ownerEmail: 'test@example.com',
        createdWithTier: 'free'
    };
}

describe('GameEndChecker', () => {
    let checker: GameEndChecker;

    beforeEach(() => {
        checker = new GameEndChecker();
    });

    describe('werewolves win (werewolves equal or outnumber other alive players)', () => {
        it('should end the game when alive werewolves equal alive non-werewolves', () => {
            // 2 werewolf bots vs 1 villager bot + human villager => 2 vs 2
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER)
                ]
            });

            const result: WinConditionResult = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBe('werewolves');
            expect(result.reason).toContain('Werewolves');
        });

        it('should end the game when alive werewolves outnumber alive non-werewolves', () => {
            // 2 werewolves vs human only => 2 vs 1
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBe('werewolves');
        });

        it('should not count dead werewolves toward the werewolf side', () => {
            // 1 alive werewolf + 1 dead werewolf vs 2 villager bots + human => 1 vs 3
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.DOCTOR)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(false);
        });

        it('should count a human werewolf toward the werewolf side', () => {
            // Human werewolf + 1 villager bot => 1 vs 1 => werewolves win
            const game = makeGame({
                humanPlayerRole: GAME_ROLES.WEREWOLF,
                bots: [makeBot('Alice', GAME_ROLES.VILLAGER)]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBe('werewolves');
        });

        it('should count special roles (doctor, detective, maniac) on the non-werewolf side', () => {
            // 2 werewolves vs doctor + detective + maniac + human => 2 vs 4
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF),
                    makeBot('Doc', GAME_ROLES.DOCTOR),
                    makeBot('Sherlock', GAME_ROLES.DETECTIVE),
                    makeBot('Jack', GAME_ROLES.MANIAC)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(false);
        });
    });

    describe('villagers win (all werewolves dead)', () => {
        it('should end the game when all werewolf bots are dead', () => {
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Fang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBe('villagers');
            expect(result.reason).toContain('All werewolves have been eliminated');
        });

        it('should declare villagers winners even when only the human survives', () => {
            // All bots dead, human villager is always treated as alive
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER, false)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBe('villagers');
        });

        it('should not declare villagers winners while the human werewolf is alive', () => {
            // All werewolf bots dead, but the human is a werewolf and the human
            // is always counted as alive, so werewolves are not eliminated.
            // 1 (human werewolf) vs 2 villager bots => game continues.
            const game = makeGame({
                humanPlayerRole: GAME_ROLES.WEREWOLF,
                bots: [
                    makeBot('Fang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(false);
        });
    });

    describe('human player eliminated', () => {
        // The checker finds the human by looking for a bot whose name matches
        // humanPlayerName. The game is over only if such a bot exists and is dead.
        it('should end the game immediately when the human player is dead', () => {
            const game = makeGame({
                humanPlayerName: 'Human',
                bots: [
                    makeBot('Human', GAME_ROLES.VILLAGER, false),
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBeUndefined();
            expect(result.reason).toBe('The human player has been eliminated');
        });

        it('should take priority over the villagers-win condition', () => {
            // Human dead AND all werewolves dead: human elimination is reported,
            // not a villagers win.
            const game = makeGame({
                humanPlayerName: 'Human',
                bots: [
                    makeBot('Human', GAME_ROLES.VILLAGER, false),
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBeUndefined();
            expect(result.reason).toBe('The human player has been eliminated');
        });

        it('should take priority over the werewolves-win condition', () => {
            // Human dead AND werewolves outnumber everyone.
            const game = makeGame({
                humanPlayerName: 'Human',
                bots: [
                    makeBot('Human', GAME_ROLES.VILLAGER, false),
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(true);
            expect(result.winner).toBeUndefined();
            expect(result.reason).toBe('The human player has been eliminated');
        });

        it('should treat the human as alive when no bot entry matches the human name', () => {
            // Pins CURRENT behavior: HumanEliminatedChecker looks the human up in
            // game.bots. If the human has no bot entry, they can never be detected
            // as eliminated, regardless of game state. Suspected gap if the human
            // is not mirrored into the bots array elsewhere in the app.
            const game = makeGame({
                humanPlayerName: 'Human',
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(false);
        });
    });

    describe('game must not end yet', () => {
        it('should continue when alive non-werewolves outnumber alive werewolves', () => {
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result).toEqual({ isEnded: false, reason: 'Game continues' });
        });

        it('should continue right after a werewolf elimination that does not end the game', () => {
            // 1 of 2 werewolves voted out: 1 werewolf vs 2 villager bots + human
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Fang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            const result = checker.check(game);

            expect(result.isEnded).toBe(false);
        });
    });

    describe('getEndGameMessage', () => {
        it('should announce a villagers win and reveal every player name and role', () => {
            const game = makeGame({
                humanPlayerName: 'Human',
                humanPlayerRole: GAME_ROLES.DETECTIVE,
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Doc', GAME_ROLES.DOCTOR)
                ]
            });

            const message = checker.getEndGameMessage(game);

            expect(message).toContain('GAME OVER - VILLAGERS WIN!');
            expect(message).toContain('Final Role Reveals:');
            // Every player appears with their role
            expect(message).toContain(`Human: 🔍 **${GAME_ROLES.DETECTIVE}**`);
            expect(message).toContain(`Wolfgang: 🐺 **${GAME_ROLES.WEREWOLF}**`);
            expect(message).toContain(`Alice: 👤 **${GAME_ROLES.VILLAGER}**`);
            expect(message).toContain(`Doc: 🏥 **${GAME_ROLES.DOCTOR}**`);
            // Alive/dead statuses
            expect(message).toContain('Wolfgang: 🐺 **werewolf** (💀 Dead)');
            expect(message).toContain('Alice: 👤 **villager** (✅ Alive)');
        });

        it('should announce a werewolves win and reveal every player name and role', () => {
            const game = makeGame({
                humanPlayerName: 'Human',
                humanPlayerRole: GAME_ROLES.VILLAGER,
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Fang', GAME_ROLES.WEREWOLF),
                    makeBot('Jack', GAME_ROLES.MANIAC, false)
                ]
            });

            const message = checker.getEndGameMessage(game);

            expect(message).toContain('GAME OVER - WEREWOLVES WIN!');
            expect(message).toContain('Final Role Reveals:');
            expect(message).toContain(`Human: 👤 **${GAME_ROLES.VILLAGER}** (✅ Alive)`);
            expect(message).toContain(`Wolfgang: 🐺 **${GAME_ROLES.WEREWOLF}** (✅ Alive)`);
            expect(message).toContain(`Fang: 🐺 **${GAME_ROLES.WEREWOLF}** (✅ Alive)`);
            expect(message).toContain(`Jack: 🔪 **${GAME_ROLES.MANIAC}** (💀 Dead)`);
        });

        it('should announce the human elimination and always show the human as dead', () => {
            const game = makeGame({
                humanPlayerName: 'Human',
                humanPlayerRole: GAME_ROLES.VILLAGER,
                bots: [
                    makeBot('Human', GAME_ROLES.VILLAGER, false),
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER)
                ]
            });

            const message = checker.getEndGameMessage(game);

            expect(message).toContain('GAME OVER');
            expect(message).toContain('The human player has been eliminated from the game.');
            expect(message).toContain('Final Role Reveals:');
            // The human appears in the reveal list as dead (hardcoded in the checker)
            expect(message).toContain(`Human: 👤 **${GAME_ROLES.VILLAGER}** (💀 Dead)`);
            expect(message).toContain(`Wolfgang: 🐺 **${GAME_ROLES.WEREWOLF}** (✅ Alive)`);
            expect(message).toContain(`Alice: 👤 **${GAME_ROLES.VILLAGER}**`);
        });

        it('should render an unknown role with the fallback emoji', () => {
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF, false),
                    makeBot('Mystery', 'jester')
                ]
            });

            const message = checker.getEndGameMessage(game);

            expect(message).toContain('Mystery: ❓ **jester**');
        });

        it('should return an empty string when no win condition is met', () => {
            const game = makeGame({
                bots: [
                    makeBot('Wolfgang', GAME_ROLES.WEREWOLF),
                    makeBot('Alice', GAME_ROLES.VILLAGER),
                    makeBot('Bob', GAME_ROLES.VILLAGER)
                ]
            });

            expect(checker.getEndGameMessage(game)).toBe('');
        });
    });
});
