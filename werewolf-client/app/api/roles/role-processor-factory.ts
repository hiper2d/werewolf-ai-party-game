import { Game, GAME_ROLES, ROLE_CONFIGS } from "@/app/api/game-models";
import { BaseRoleProcessor, NightState } from "./base-role-processor";

/**
 * Type for role processor constructor
 */
type RoleProcessorConstructor = new (gameId: string, game: Game) => BaseRoleProcessor;

/**
 * Role processor registry - each processor registers itself
 */
const ROLE_PROCESSORS: Record<string, RoleProcessorConstructor> = {};

/**
 * Register a role processor for a specific role
 * @param roleName - The name of the role
 * @param processorClass - The processor class constructor
 */
export function registerRoleProcessor(roleName: string, processorClass: RoleProcessorConstructor): void {
    ROLE_PROCESSORS[roleName] = processorClass;
    console.log(`🎭 Registered role processor for: ${roleName}`);
}

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
        const ProcessorClass = ROLE_PROCESSORS[roleName];
        if (ProcessorClass) {
            return new ProcessorClass(gameId, game);
        }

        // Check if role exists but doesn't have a processor (like Villager)
        if (ROLE_CONFIGS[roleName] && !ROLE_CONFIGS[roleName].hasNightAction) {
            return null;
        }

        console.warn(`Unknown role: ${roleName}. No processor available.`);
        return null;
    }

    /**
     * Check if a role has night actions based on config
     * @param roleName - The name of the role
     * @returns True if the role has night actions, false otherwise
     */
    static hasNightActions(roleName: string): boolean {
        return ROLE_CONFIGS[roleName]?.hasNightAction || false;
    }

    /**
     * Get all roles that have night actions, sorted by nightActionOrder
     * @returns Array of role names that have night actions, sorted by action order
     */
    static getRolesWithNightActions(): string[] {
        return Object.entries(ROLE_CONFIGS)
            .filter(([_, config]) => config.hasNightAction)
            .sort((a, b) => (a[1].nightActionOrder ?? 999) - (b[1].nightActionOrder ?? 999))
            .map(([role]) => role);
    }

    /**
     * Check if a processor is registered for a role
     * @param roleName - The name of the role
     * @returns True if a processor is registered for this role
     */
    static hasProcessor(roleName: string): boolean {
        return roleName in ROLE_PROCESSORS;
    }

    /**
     * Run resolveNightAction for all roles (in nightActionOrder) and return
     * the resulting NightState. Optionally stop BEFORE a given role so callers
     * can see what the state would be at that point in the pipeline.
     *
     * @param gameId  - The game ID
     * @param game    - Current game state (with nightResults populated)
     * @param stopBeforeRole - If provided, stop before running this role's resolver
     */
    static resolveNightState(
        gameId: string,
        game: Game,
        stopBeforeRole?: string
    ): NightState {
        const state: NightState = {
            deaths: [],
            abductedPlayer: null,
            detectiveResult: null,
            werewolfKillPrevented: false,
            noWerewolfActivity: false
        };
        const nightResults = game.nightResults || {};
        const roles = RoleProcessorFactory.getRolesWithNightActions();

        for (const roleName of roles) {
            if (stopBeforeRole && roleName === stopBeforeRole) break;
            const processor = RoleProcessorFactory.createProcessor(roleName, gameId, game);
            if (processor) {
                processor.resolveNightAction(nightResults, state);
            }
        }
        return state;
    }
}