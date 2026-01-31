// Role processor exports
export { BaseRoleProcessor } from './base-role-processor';
export type { NightActionResult, RolePlayersInfo, RoleInitResult, NightState, NightDeath, DetectiveResult } from './base-role-processor';

export { WerewolfProcessor } from './werewolf-processor';
export { DoctorProcessor } from './doctor-processor';
export { DetectiveProcessor } from './detective-processor';
export { ManiacProcessor } from './maniac-processor';

export { RoleProcessorFactory, registerRoleProcessor } from './role-processor-factory';