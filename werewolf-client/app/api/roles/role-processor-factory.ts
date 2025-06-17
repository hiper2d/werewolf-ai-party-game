import { Game, GAME_ROLES } from "@/app/api/game-models";
import { BaseRoleProcessor } from "./base-role-processor";
import { WerewolfProcessor } from "./werewolf-processor";
import { DoctorProcessor } from "./doctor-processor";
import { DetectiveProcessor } from "./detective-processor";

/**
 * Factory class for creating role processors
 * Maps role names to their corresponding processor implementations
 */
export class RoleProcessorFactory {
    /**
     * Create a role processor for the specified role
     * @param roleName - The name of the role (e.g., 'werewolf', 'doctor', 'detective')
     * @param gameId - The game ID
     * @param game - The current game state
     * @returns A role processor instance or null if role doesn't have night actions
     */
    static createProcessor(roleName: string, gameId: string, game: Game): BaseRoleProcessor | null {
        switch (roleName) {
            case GAME_ROLES.WEREWOLF:
                return new WerewolfProcessor(gameId, game);
            
            case GAME_ROLES.DOCTOR:
                return new DoctorProcessor(gameId, game);
            
            case GAME_ROLES.DETECTIVE:
                return new DetectiveProcessor(gameId, game);
            
            case GAME_ROLES.VILLAGER:
                // Villagers don't have night actions
                return null;
            
            default:
                console.warn(`Unknown role: ${roleName}. No processor available.`);
                return null;
        }
    }

    /**
     * Check if a role has night actions (i.e., has a processor)
     * @param roleName - The name of the role
     * @returns True if the role has night actions, false otherwise
     */
    static hasNightActions(roleName: string): boolean {
        return roleName === GAME_ROLES.WEREWOLF || 
               roleName === GAME_ROLES.DOCTOR || 
               roleName === GAME_ROLES.DETECTIVE;
    }

    /**
     * Get all roles that have night actions
     * @returns Array of role names that have night actions
     */
    static getRolesWithNightActions(): string[] {
        return [
            GAME_ROLES.WEREWOLF,
            GAME_ROLES.DOCTOR,
            GAME_ROLES.DETECTIVE
        ];
    }
}