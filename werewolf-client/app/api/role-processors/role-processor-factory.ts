import { RoleActionProcessor } from './abstract-role-processor';
import { WerewolfProcessor } from './werewolf-processor';
import { DoctorProcessor } from './doctor-processor';
import { DetectiveProcessor } from './detective-processor';

export function createRoleProcessor(
    roleName: string,
    gameId: string,
    userEmail: string
): RoleActionProcessor {
    switch (roleName) {
        case 'werewolf':
            return new WerewolfProcessor(gameId, userEmail);
        case 'doctor':
            return new DoctorProcessor(gameId, userEmail);
        case 'detective':
            return new DetectiveProcessor(gameId, userEmail);
        default:
            throw new Error(`Unknown role: ${roleName}`);
    }
}