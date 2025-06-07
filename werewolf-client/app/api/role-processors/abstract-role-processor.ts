import { Game } from '../game-models';

export abstract class RoleActionProcessor {
    constructor(
        protected gameId: string,
        protected userEmail: string
    ) {}

    /**
     * Process the current role's night action
     * @param game Current game state
     * @returns true if the role's action is complete, false if more processing needed
     */
    abstract process(game: Game): Promise<boolean>;

    /**
     * Check if the current role has any players that can act
     * @param game Current game state
     * @returns true if role has active players
     */
    protected hasActivePlayers(game: Game, roleName: string): boolean {
        // Check if human player has this role and is alive
        if (game.humanPlayerRole === roleName) {
            return true;
        }

        // Check if any bots have this role and are alive
        return game.bots.some(bot => bot.role === roleName && bot.isAlive);
    }

    /**
     * Get all players (human + bots) with the specified role who are alive
     */
    protected getPlayersWithRole(game: Game, roleName: string): string[] {
        const players: string[] = [];

        // Add human player if they have this role
        if (game.humanPlayerRole === roleName) {
            players.push(game.humanPlayerName);
        }

        // Add bots with this role who are alive
        game.bots
            .filter(bot => bot.role === roleName && bot.isAlive)
            .forEach(bot => players.push(bot.name));

        return players;
    }
}