import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES } from "@/app/api/game-models";

/**
 * Doctor role processor
 * Handles doctor night actions (protection of players from elimination)
 */
export class DoctorProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DOCTOR);
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            // First, announce that it's the doctor's turn
            await this.announceRoleTurn();

            const playersInfo = this.getPlayersWithRole();
            
            if (playersInfo.allPlayers.length === 0) {
                // No doctors alive, skip this action
                this.logNightAction("No doctors alive, skipping action");
                return { success: true };
            }

            // For individual roles like doctor, typically only one player
            const doctorName = playersInfo.allPlayers[0].name;
            this.logNightAction(`Doctor (${doctorName}) is taking their night action`);

            // For now, just log the action - actual protection logic will be implemented later
            // This is where we would:
            // 1. Determine which player the doctor wants to protect
            // 2. Apply the protection for this night
            // 3. Send appropriate messages

            // Send a message indicating doctor is active
            await this.sendMessage(`🏥 The doctor moves quietly through the night, preparing to save a life...`);

            return {
                success: true,
                messages: []
            };

        } catch (error) {
            console.error('Error in DoctorProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in doctor action'
            };
        }
    }
}