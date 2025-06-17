import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES } from "@/app/api/game-models";

/**
 * Werewolf role processor
 * Handles werewolf night actions (elimination of other players)
 */
export class WerewolfProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.WEREWOLF);
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            // First, announce that it's the werewolves' turn
            await this.announceRoleTurn();

            const playersInfo = this.getPlayersWithRole();
            
            if (playersInfo.allPlayers.length === 0) {
                // No werewolves alive, skip this action
                this.logNightAction("No werewolves alive, skipping action");
                return { success: true };
            }

            // Log the werewolves taking action
            const werewolfNames = playersInfo.allPlayers.map(p => p.name).join(', ');
            this.logNightAction(`Werewolves (${werewolfNames}) are taking their night action`);

            // For now, just log the action - actual elimination logic will be implemented later
            // This is where we would:
            // 1. Determine which player the werewolves want to eliminate
            // 2. Apply the elimination (unless protected by doctor)
            // 3. Send appropriate messages

            // Send a message indicating werewolves are active
            await this.sendMessage(`🐺 The werewolves stir in the darkness, planning their next move...`);

            return {
                success: true,
                messages: []
            };

        } catch (error) {
            console.error('Error in WerewolfProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in werewolf action'
            };
        }
    }
}