export interface RoleConfig {
    name: string;
    instruction: string;
    gm_command: string;
    order: number; // Execution order during night phase
}

export const NIGHT_ROLES_CONFIG: RoleConfig[] = [
    {
        name: 'werewolf',
        instruction: 'You can discuss with other werewolves and choose a victim to eliminate.',
        gm_command: 'Discuss with your fellow werewolves and choose tonight\'s victim.',
        order: 1
    },
    {
        name: 'doctor',
        instruction: 'You can save one player each night (including yourself).',
        gm_command: 'Choose a player to save tonight.',
        order: 2
    },
    {
        name: 'detective',
        instruction: 'You can investigate one player\'s true role each night.',
        gm_command: 'Choose a player to investigate tonight.',
        order: 3
    }
];

export function getRoleConfig(roleName: string): RoleConfig | undefined {
    return NIGHT_ROLES_CONFIG.find(role => role.name === roleName);
}

export function getNightRolesInOrder(): RoleConfig[] {
    return NIGHT_ROLES_CONFIG.sort((a, b) => a.order - b.order);
}