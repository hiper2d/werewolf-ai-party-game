import { Bot, Game, GAME_ROLES, PLAY_STYLES, PLAY_STYLE_CONFIGS } from "@/app/api/game-models";

/**
 * Generates a random play style description for a bot
 */
export function generatePlayStyleDescription(bot: Bot): string {
    const config = PLAY_STYLE_CONFIGS[bot.playStyle];
    if (!config) {
        return 'You have a balanced and thoughtful personality.';
    }
    
    // Use werewolfDescription for werewolf bots, villagerDescription for others
    const description = bot.role === GAME_ROLES.WEREWOLF 
        ? config.werewolfDescription 
        : config.villagerDescription;
    
    return description;
}

/**
 * Generates the werewolf teammates section for the bot prompt
 * @param bot The current bot
 * @param game The game state
 * @returns Formatted werewolf teammates section or empty string
 */
export function generateWerewolfTeammatesSection(bot: Bot, game: Game): string {
    if (bot.role !== GAME_ROLES.WEREWOLF) {
        return '';
    }
    
    const werewolfTeammates: string[] = [];
    
    // Add werewolf bots (excluding the current bot)
    game.bots
        .filter(b => b.role === GAME_ROLES.WEREWOLF && b.name !== bot.name)
        .forEach(b => werewolfTeammates.push(b.name));
    
    // Add human player if they are a werewolf
    if (game.humanPlayerRole === GAME_ROLES.WEREWOLF) {
        werewolfTeammates.push(game.humanPlayerName);
    }
    
    if (werewolfTeammates.length === 0) {
        return '';
    }
    
    return `\n  <WerewolfTeammates>${werewolfTeammates.join(', ')}</WerewolfTeammates>`;
}

/**
 * Generates the previous day summaries section for the bot prompt
 * @param bot The current bot
 * @param currentDay The current day number
 * @returns Formatted previous day summaries section or empty string
 */
export function generatePreviousDaySummariesSection(bot: Bot, currentDay: number): string {
    // No summaries needed for day 1
    if (currentDay <= 1) {
        return '';
    }
    
    // No summaries if bot doesn't have them or has empty array
    if (!bot.daySummaries || bot.daySummaries.length === 0) {
        return '';
    }
    
    const summaries: string[] = [];
    
    // Add summaries for all previous days (day 1 = index 0, day 2 = index 1, etc.)
    for (let day = 1; day < currentDay; day++) {
        const summaryIndex = day - 1; // Convert day number to array index
        if (bot.daySummaries[summaryIndex] && bot.daySummaries[summaryIndex].trim()) {
            summaries.push(`**Day ${day}:** ${bot.daySummaries[summaryIndex]}`);
        }
    }
    
    if (summaries.length === 0) {
        return '';
    }
    
    return `\n\n## Previous Day Summaries\n\nHere are your memories from previous days to help you remember important events and maintain consistency:\n\n${summaries.join('\n\n')}`;
}