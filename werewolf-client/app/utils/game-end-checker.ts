import { Game, GAME_ROLES } from '@/app/api/game-models';
import { gameText, GameTextKey, roleName } from '@/app/ai/game-language';

/**
 * Result of a win condition check
 */
export interface WinConditionResult {
    isEnded: boolean;
    winner?: 'werewolves' | 'villagers' | 'tie';
    reason: string;
}

/**
 * Interface for win condition checkers using Strategy pattern
 */
interface WinConditionChecker {
    /**
     * Check if this win condition is met
     * @returns WinConditionResult if condition is met, null otherwise
     */
    check(game: Game): WinConditionResult | null;

    /**
     * Generate the end game message with role reveals
     * @param game Current game state
     * @returns Formatted message announcing winner and revealing roles
     */
    getEndGameMessage(game: Game): string;
}

function roleEmoji(role: string): string {
    switch (role) {
        case GAME_ROLES.WEREWOLF: return '🐺';
        case GAME_ROLES.DOCTOR: return '🏥';
        case GAME_ROLES.DETECTIVE: return '🔍';
        case GAME_ROLES.MANIAC: return '🔪';
        case GAME_ROLES.VILLAGER: return '👤';
        default: return '❓';
    }
}

/**
 * The end-of-game block in the game's language: title, one line on how it ended, and
 * every player's role. `humanIsAlive` is what the list says about the human — the human
 * is not a bot entry, and the human-eliminated checker is called before the game doc
 * records their death.
 */
function endGameMessage(game: Game, title: GameTextKey, body: GameTextKey, humanIsAlive: boolean): string {
    const allPlayers = [
        { name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: humanIsAlive },
        ...game.bots.map(bot => ({ name: bot.name, role: bot.role, isAlive: bot.isAlive })),
    ];
    const roleList = allPlayers
        .map(player => {
            const status = gameText(game, player.isAlive ? 'alive' : 'dead');
            return `• ${player.name}: ${roleEmoji(player.role)} **${roleName(game, player.role)}** (${status})`;
        })
        .join('\n');
    return `\n\n${gameText(game, title)}\n\n` +
           `${gameText(game, body)}\n\n` +
           `${gameText(game, 'final_roles')}\n${roleList}`;
}

/**
 * Check if human player has been eliminated
 */
class HumanEliminatedChecker implements WinConditionChecker {
    check(game: Game): WinConditionResult | null {
        // The human is not mirrored into game.bots — their alive status lives on the
        // game itself (set on day-vote and night-kill). Legacy games without the
        // field default to alive.
        const humanIsAlive = game.humanPlayerIsAlive ?? true;

        if (!humanIsAlive) {
            return {
                isEnded: true,
                winner: undefined,
                reason: 'The human player has been eliminated'
            };
        }
        return null;
    }

    getEndGameMessage(game: Game): string {
        return endGameMessage(game, 'game_over_human_title', 'game_over_human_body', false);
    }
}

/**
 * Check if all werewolves are dead (villagers win)
 */
class VillagersWinChecker implements WinConditionChecker {
    check(game: Game): WinConditionResult | null {
        const alivePlayers = [
            ...((game.humanPlayerIsAlive ?? true)
                ? [{ name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: true }]
                : []),
            ...game.bots.filter(bot => bot.isAlive)
        ];

        const aliveWerewolves = alivePlayers.filter(player =>
            player.role === GAME_ROLES.WEREWOLF
        ).length;

        const aliveVillagers = alivePlayers.filter(player =>
            player.role !== GAME_ROLES.WEREWOLF
        ).length;

        if (aliveWerewolves === 0 && aliveVillagers > 0) {
            return {
                isEnded: true,
                winner: 'villagers',
                reason: 'All werewolves have been eliminated! Villagers win!'
            };
        }
        return null;
    }

    getEndGameMessage(game: Game): string {
        return endGameMessage(game, 'game_over_villagers_title', 'game_over_villagers_body', game.humanPlayerIsAlive ?? true);
    }
}

/**
 * Check if werewolves outnumber villagers (werewolves win)
 */
class WerewolvesWinChecker implements WinConditionChecker {
    check(game: Game): WinConditionResult | null {
        const alivePlayers = [
            ...((game.humanPlayerIsAlive ?? true)
                ? [{ name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: true }]
                : []),
            ...game.bots.filter(bot => bot.isAlive)
        ];

        const aliveWerewolves = alivePlayers.filter(player =>
            player.role === GAME_ROLES.WEREWOLF
        ).length;

        const aliveVillagers = alivePlayers.filter(player =>
            player.role !== GAME_ROLES.WEREWOLF
        ).length;

        if (aliveWerewolves >= aliveVillagers && aliveWerewolves > 0) {
            return {
                isEnded: true,
                winner: 'werewolves',
                reason: 'Werewolves equal or outnumber villagers! Werewolves win!'
            };
        }
        return null;
    }

    getEndGameMessage(game: Game): string {
        return endGameMessage(game, 'game_over_werewolves_title', 'game_over_werewolves_body', game.humanPlayerIsAlive ?? true);
    }
}

/**
 * Main class that orchestrates win condition checking
 * Uses Strategy pattern to check conditions in priority order
 */
export class GameEndChecker {
    private checkers: WinConditionChecker[];

    constructor() {
        // Order matters! Check in priority:
        // 1. Human eliminated (special case)
        // 2. All werewolves dead (villagers win)
        // 3. Werewolves equal or outnumber villagers (werewolves win)
        this.checkers = [
            new HumanEliminatedChecker(),
            new VillagersWinChecker(),
            new WerewolvesWinChecker()
        ];
    }

    /**
     * Check all win conditions in order, stopping at the first match
     * @param game Current game state
     * @returns WinConditionResult indicating if game has ended and why
     */
    check(game: Game): WinConditionResult {
        for (const checker of this.checkers) {
            const result = checker.check(game);
            if (result) {
                return result;
            }
        }
        return { isEnded: false, reason: 'Game continues' };
    }

    /**
     * Get the formatted end game message with role reveals
     * @param game Current game state
     * @returns Formatted message for the game master to announce
     */
    getEndGameMessage(game: Game): string {
        for (const checker of this.checkers) {
            const result = checker.check(game);
            if (result) {
                return checker.getEndGameMessage(game);
            }
        }
        return '';
    }
}
