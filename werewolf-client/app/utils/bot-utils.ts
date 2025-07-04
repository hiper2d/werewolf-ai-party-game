import { Bot, GAME_ROLES, PLAY_STYLES, PLAY_STYLE_CONFIGS } from "@/app/api/game-models";

/**
 * Generates the play style description for a bot
 */
export function generatePlayStyleDescription(bot: Bot): string {
    const config = PLAY_STYLE_CONFIGS[bot.playStyle];
    if (!config) {
        return 'You have a balanced and thoughtful personality.';
    }
    
    // Use werewolfDescription for werewolf bots, regular description for others
    const description = bot.role === GAME_ROLES.WEREWOLF 
        ? config.werewolfDescription 
        : config.description;
    
    return description;
}