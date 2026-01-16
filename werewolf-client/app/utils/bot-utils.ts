import { Bot, Game, GAME_ROLES, PLAY_STYLES, PLAY_STYLE_CONFIGS, RoleKnowledge } from "@/app/api/game-models";

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
 * Generates role-specific knowledge section based on the bot's role
 * This provides clear, structured information about night action results
 *
 * @param bot The current bot
 * @returns Formatted role knowledge section or empty string
 */
export function generateRoleKnowledgeSection(bot: Bot): string {
    if (!bot.roleKnowledge) {
        return '';
    }

    const sections: string[] = [];

    // Detective investigations
    if (bot.role === GAME_ROLES.DETECTIVE && bot.roleKnowledge.investigations && bot.roleKnowledge.investigations.length > 0) {
        const investigationLines = bot.roleKnowledge.investigations.map(inv => {
            // Handle unsuccessful investigations (blocked by some future role)
            if (inv.success === false) {
                return `- **Night ${inv.day}:** Investigated **${inv.target}** → ❌ Investigation failed/blocked`;
            }
            const status = inv.isWerewolf ? '🐺 **WEREWOLF**' : '✓ Not a Werewolf';
            return `- **Night ${inv.day}:** Investigated **${inv.target}** → ${status}`;
        }).join('\n');

        // Only count successful investigations
        const confirmedWerewolves = bot.roleKnowledge.investigations
            .filter(inv => inv.success !== false && inv.isWerewolf)
            .map(inv => inv.target);

        const clearedPlayers = bot.roleKnowledge.investigations
            .filter(inv => inv.success !== false && !inv.isWerewolf)
            .map(inv => inv.target);

        let summary = `## 🔍 Your Detective Investigation Results\n\n${investigationLines}`;

        if (confirmedWerewolves.length > 0) {
            summary += `\n\n**CONFIRMED WEREWOLVES:** ${confirmedWerewolves.join(', ')}`;
        }
        if (clearedPlayers.length > 0) {
            summary += `\n**CLEARED PLAYERS:** ${clearedPlayers.join(', ')}`;
        }

        sections.push(summary);
    }

    // Doctor protections
    if (bot.role === GAME_ROLES.DOCTOR && bot.roleKnowledge.protections && bot.roleKnowledge.protections.length > 0) {
        const protectionLines = bot.roleKnowledge.protections.map(prot => {
            // Handle unsuccessful protections (blocked by some future role)
            if (prot.success === false) {
                return `- **Night ${prot.day}:** Tried to protect **${prot.target}** → ❌ Protection failed/blocked`;
            }
            const savedNote = prot.savedTarget === true ? ' 🛡️ (SAVED THEM from werewolves!)' : '';
            return `- **Night ${prot.day}:** Protected **${prot.target}**${savedNote}`;
        }).join('\n');

        const lastProtection = bot.roleKnowledge.protections[bot.roleKnowledge.protections.length - 1];

        let summary = `## 🏥 Your Doctor Protection History\n\n${protectionLines}`;
        if (lastProtection.success !== false) {
            summary += `\n\n**REMINDER:** You protected **${lastProtection.target}** last night, so you CANNOT protect them again tonight.`;
        }

        sections.push(summary);
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
}

/**
 * Generates the complete context section for the bot prompt including:
 * - Role-specific knowledge (investigations, protections, etc.)
 * - Bot's personal summary
 * - Voting history statistics
 * - Night narrative summaries
 *
 * @param bot The current bot
 * @param game The game state
 * @returns Formatted context section or empty string
 */
export function generateBotContextSection(bot: Bot, game: Game): string {
    const sections: string[] = [];

    // 1. Role-Specific Knowledge (FIRST - most important for special roles)
    const roleKnowledge = generateRoleKnowledgeSection(bot);
    if (roleKnowledge) {
        sections.push(roleKnowledge);
    }

    // 2. Bot's Personal Summary (with legacy daySummaries fallback)
    let summary = bot.summary;
    if (!summary && bot.daySummaries && bot.daySummaries.length > 0) {
        // Legacy fallback: concatenate old daySummaries format
        summary = bot.daySummaries
            .filter((s: string) => s && s.trim())
            .map((s: string, i: number) => `**Day ${i + 1}:** ${s}`)
            .join('\n\n');
    }

    if (summary && summary.trim()) {
        sections.push(`## Your Personal Summary\n\n${summary}`);
    }

    // 3. Voting History
    if (game.votingHistory && game.votingHistory.length > 0) {
        const votingLines = game.votingHistory.map(v => {
            const voteStr = Object.entries(v.voteCounts)
                .map(([name, count]) => `${name}: ${count} vote(s)`)
                .join(', ');
            const eliminated = v.eliminatedPlayer
                ? `${v.eliminatedPlayer} eliminated (was ${v.eliminatedPlayerRole})`
                : 'No elimination';
            return `**Day ${v.day}:** ${voteStr}. ${eliminated}.`;
        }).join('\n');
        sections.push(`## Voting History\n\n${votingLines}`);
    }

    // 4. Night Narratives
    if (game.nightNarratives && game.nightNarratives.length > 0) {
        const nightLines = game.nightNarratives.map(n =>
            `**Night ${n.day}:**\n${n.narrative}`
        ).join('\n\n');
        sections.push(`## Night Events\n\n${nightLines}`);
    }

    if (sections.length === 0) {
        return '';
    }

    return '\n\n' + sections.join('\n\n');
}

/**
 * @deprecated Use generateBotContextSection instead
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