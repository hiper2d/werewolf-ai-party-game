import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES } from "@/app/api/game-models";

/**
 * Detective role processor
 * Handles detective night actions (investigation of players to learn their roles)
 */
export class DetectiveProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DETECTIVE);
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            // First, announce that it's the detective's turn
            await this.announceRoleTurn();

            const playersInfo = this.getPlayersWithRole();
            
            if (playersInfo.allPlayers.length === 0) {
                // No detectives alive, skip this action
                this.logNightAction("No detectives alive, skipping action");
                return { success: true };
            }

            // The gameStateParamQueue should already be populated by the generic night action logic
            if (this.game.gameStateParamQueue.length === 0) {
                this.logNightAction("No detectives in action queue, skipping");
                return { success: true };
            }

            // Get the current detective from the param queue
            const detectiveName = this.game.gameStateParamQueue[0];
            const remainingQueue = this.game.gameStateParamQueue.slice(1);
            
            this.logNightAction(`Detective (${detectiveName}) is taking their night action`);

            // For now, just log the action - actual investigation logic will be implemented later
            // This is where we would:
            // 1. Determine which player the detective wants to investigate
            // 2. Reveal the target's role to the detective
            // 3. Send appropriate messages

            // Send a message indicating detective is active
            await this.sendMessage(`🔍 The detective searches for clues in the shadows, seeking the truth...`);

            return {
                success: true,
                gameUpdates: {
                    gameStateParamQueue: remainingQueue
                }
            };

        } catch (error) {
            console.error('Error in DetectiveProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in detective action'
            };
        }
    }
}