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
