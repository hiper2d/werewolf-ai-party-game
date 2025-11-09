import { Game, GAME_ROLES } from '@/app/api/game-models';

/**
 * Check if the game has ended based on current conditions
 * Returns an object with isEnded flag and winner if game has ended
 */
export function checkGameEndConditions(game: Game): { isEnded: boolean; winner?: 'werewolves' | 'villagers' | 'tie'; reason?: string } {
    // Check if human player is dead (human player can be eliminated if they match a bot name or game is marked as over)
    const humanBot = game.bots.find(bot => bot.name === game.humanPlayerName);
    const humanIsAlive = !humanBot || humanBot.isAlive;
    
    // If human player has died, game is over for them
    if (!humanIsAlive) {
        return { 
            isEnded: true, 
            winner: undefined, 
            reason: 'The human player has been eliminated'
        };
    }
    
    // Count alive werewolves and villagers
    const alivePlayers = [
        { name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: true },
        ...game.bots.filter(bot => bot.isAlive)
    ];
    
    const aliveWerewolves = alivePlayers.filter(player => 
        player.role === GAME_ROLES.WEREWOLF
    ).length;
    
    const aliveVillagers = alivePlayers.filter(player => 
        player.role !== GAME_ROLES.WEREWOLF
    ).length;
    
    // Check win conditions
    if (aliveWerewolves === 0 && aliveVillagers > 0) {
        return { 
            isEnded: true, 
            winner: 'villagers',
            reason: 'All werewolves have been eliminated! Villagers win!'
        };
    }
    
    // NEW: Tie condition - equal numbers of werewolves and villagers after night resolution
    if (aliveWerewolves === aliveVillagers && aliveWerewolves > 0) {
        return { 
            isEnded: true, 
            winner: 'tie',
            reason: 'Equal numbers of werewolves and villagers remain! It\'s a tie!'
        };
    }
    
    // MODIFIED: Werewolves win only when they strictly outnumber villagers
    if (aliveWerewolves > aliveVillagers) {
        return { 
            isEnded: true, 
            winner: 'werewolves',
            reason: 'Werewolves outnumber villagers! Werewolves win!'
        };
    }
    
    return { isEnded: false };
}