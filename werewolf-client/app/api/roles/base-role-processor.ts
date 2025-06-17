import { Game, Bot, GAME_MASTER, GameMessage, MessageType, RECIPIENT_ALL, ROLE_CONFIGS } from "@/app/api/game-models";
import { addMessageToChatAndSaveToDb } from "@/app/api/game-actions";

/**
 * Result of a night action processing
 */
export interface NightActionResult {
    // Updated game state (if any changes need to be persisted)
    gameUpdates?: Partial<Game>;
    // Messages to be sent to players
    messages?: GameMessage[];
    // Whether the action was successfully completed
    success: boolean;
    // Optional error message if action failed
    error?: string;
}

/**
 * Information about players with a specific role
 */
export interface RolePlayersInfo {
    // All players (bots + human) with this role who are alive
    allPlayers: Array<{ name: string; isHuman: boolean; bot?: Bot }>;
    // Just the bot players with this role
    bots: Bot[];
    // Whether the human player has this role
    hasHumanPlayer: boolean;
    // Human player name if they have this role
    humanPlayerName?: string;
}

/**
 * Abstract base class for role processors
 * Each role that has night actions should extend this class
 */
export abstract class BaseRoleProcessor {
    protected gameId: string;
    protected game: Game;
    protected roleName: string;

    constructor(gameId: string, game: Game, roleName: string) {
        this.gameId = gameId;
        this.game = game;
        this.roleName = roleName;
    }

    /**
     * Main method to process the night action for this role
     * This is called when it's this role's turn during the night
     */
    abstract processNightAction(): Promise<NightActionResult>;

    /**
     * Get information about all players who have this role
     */
    protected getPlayersWithRole(): RolePlayersInfo {
        // Find all alive bots with this role
        const bots = this.game.bots.filter(bot => bot.isAlive && bot.role === this.roleName);
        
        // Check if human player has this role
        const hasHumanPlayer = this.game.humanPlayerRole === this.roleName;
        const humanPlayerName = hasHumanPlayer ? this.game.humanPlayerName : undefined;

        // Combine all players
        const allPlayers = [
            ...bots.map(bot => ({ name: bot.name, isHuman: false, bot })),
            ...(hasHumanPlayer ? [{ name: this.game.humanPlayerName, isHuman: true }] : [])
        ];

        return {
            allPlayers,
            bots,
            hasHumanPlayer,
            humanPlayerName
        };
    }

    /**
     * Create a game message to be sent to all players
     */
    protected createGameMessage(content: string, messageType: MessageType = MessageType.GM_COMMAND): GameMessage {
        return {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER,
            msg: content,
            messageType,
            day: this.game.currentDay,
            timestamp: Date.now()
        };
    }

    /**
     * Send a message to all players
     */
    protected async sendMessage(content: string, messageType: MessageType = MessageType.GM_COMMAND): Promise<void> {
        const message = this.createGameMessage(content, messageType);
        await addMessageToChatAndSaveToDb(message, this.gameId);
    }

    /**
     * Announce that it's this role's turn to act
     * Sends a Game Master message explaining what this role can do without revealing player identities
     */
    protected async announceRoleTurn(): Promise<void> {
        const roleConfig = ROLE_CONFIGS[this.roleName];
        if (!roleConfig) {
            console.warn(`No role config found for ${this.roleName}`);
            return;
        }

        const playersInfo = this.getPlayersWithRole();
        if (playersInfo.allPlayers.length === 0) {
            // No players with this role are alive, don't announce
            return;
        }

        // Create a generic announcement that doesn't reveal specific player identities
        let announcement: string;
        
        if (this.roleName === 'werewolf' && playersInfo.allPlayers.length > 1) {
            // Special case for multiple werewolves
            announcement = `🌙 **Night Phase**: It's time for the ${roleConfig.name}s to act. ${roleConfig.description}.`;
        } else {
            // Single role or single werewolf
            announcement = `🌙 **Night Phase**: It's time for the ${roleConfig.name} to act. ${roleConfig.description}.`;
        }

        await this.sendMessage(announcement);
        this.logNightAction(`Announced turn for ${roleConfig.name}`);
    }

    /**
     * Log the night action for debugging purposes
     */
    protected logNightAction(actionDescription: string): void {
        console.log(`🌙 NIGHT ACTION [${this.roleName.toUpperCase()}]: ${actionDescription}`);
    }

    /**
     * Get alive players that can be targeted by actions
     * Excludes the acting players themselves (e.g., werewolves can't target other werewolves)
     */
    protected getTargetablePlayers(excludeSameRole: boolean = true): Array<{ name: string; isHuman: boolean; bot?: Bot }> {
        const targets: Array<{ name: string; isHuman: boolean; bot?: Bot }> = [];

        // Add alive bots (excluding same role if specified)
        this.game.bots
            .filter(bot => bot.isAlive && (!excludeSameRole || bot.role !== this.roleName))
            .forEach(bot => targets.push({ name: bot.name, isHuman: false, bot }));

        // Add human player if alive and not same role
        if (!excludeSameRole || this.game.humanPlayerRole !== this.roleName) {
            targets.push({ name: this.game.humanPlayerName, isHuman: true });
        }

        return targets;
    }

    /**
     * Check if a player name exists and is alive
     */
    protected isValidTarget(playerName: string): boolean {
        // Check if it's the human player
        if (playerName === this.game.humanPlayerName) {
            return true; // Human player is always alive unless game is over
        }

        // Check if it's an alive bot
        return this.game.bots.some(bot => bot.name === playerName && bot.isAlive);
    }

    /**
     * Get a bot by name (returns undefined if not found or not alive)
     */
    protected getBotByName(name: string): Bot | undefined {
        return this.game.bots.find(bot => bot.name === name && bot.isAlive);
    }
}