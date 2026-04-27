// A set of muted, dark-theme friendly colors that complement dark grey and dark blue
const playerColors = [
    '#6B8E9E', // Muted blue-grey
    '#8B7B8B', // Muted purple-grey
    '#7B8B6B', // Muted green-grey
    '#8B6B6B', // Muted red-grey
    '#6B6B8B', // Muted blue-purple
    '#8B8B6B', // Muted yellow-grey
    '#6B8B7B', // Muted teal-grey
    '#7B6B8B', // Muted purple
    '#8B7B6B', // Muted brown-grey
    '#6B7B8B', // Muted steel blue
];

// Game Master specific color
const GAME_MASTER_COLOR = '#FF6B6B'; // Coral red, more visible on dark backgrounds

/**
 * Generates a consistent color for a player based on their name
 * @param playerName The name of the player
 * @returns A hex color code from the playerColors array
 */
// 12-color avatar gradient palette (deterministic by name hash)
const avatarPalette: [string, string][] = [
    ['oklch(60% 0.18 25)',  'oklch(45% 0.18 25)'],   // red
    ['oklch(65% 0.16 60)',  'oklch(50% 0.16 60)'],   // orange
    ['oklch(70% 0.14 90)',  'oklch(55% 0.14 90)'],   // amber
    ['oklch(65% 0.14 145)', 'oklch(50% 0.14 145)'],  // green
    ['oklch(63% 0.13 195)', 'oklch(48% 0.13 195)'],  // teal
    ['oklch(60% 0.14 230)', 'oklch(45% 0.14 230)'],  // blue
    ['oklch(58% 0.16 270)', 'oklch(42% 0.16 270)'],  // indigo
    ['oklch(60% 0.18 310)', 'oklch(45% 0.18 310)'],  // magenta
    ['oklch(63% 0.16 345)', 'oklch(48% 0.16 345)'],  // pink
    ['oklch(58% 0.10 110)', 'oklch(45% 0.10 110)'],  // olive
    ['oklch(62% 0.12 175)', 'oklch(48% 0.12 175)'],  // cyan
    ['oklch(58% 0.14 290)', 'oklch(42% 0.14 290)'],  // violet
];

const GM_AVATAR_GRADIENT: [string, string] = ['oklch(65% 0.14 145)', 'oklch(50% 0.14 145)']; // green

function nameHash(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = (name.charCodeAt(i) + ((h << 5) - h)) | 0;
    }
    return Math.abs(h);
}

/**
 * Returns a [lightColor, darkColor] gradient pair for a player avatar
 */
export function getAvatarGradient(playerName: string): [string, string] {
    if (playerName === 'Game Master') return GM_AVATAR_GRADIENT;
    return avatarPalette[nameHash(playerName) % avatarPalette.length];
}

export function getPlayerColor(playerName: string): string {
    // Special case for Game Master
    if (playerName === 'Game Master') {
        return GAME_MASTER_COLOR;
    }

    // Use a simple hash function to get a consistent index for each name
    const hash = playerName.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Ensure positive index within array bounds
    const index = Math.abs(hash) % playerColors.length;
    return playerColors[index];
}
