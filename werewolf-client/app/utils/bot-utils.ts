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
            // Handle kill actions
            if (inv.actionType === 'kill') {
                return `- **Night ${inv.day}:** Used ONE-TIME KILL on **${inv.target}** 🗡️`;
            }
            // Handle unsuccessful investigations (blocked by some future role)
            if (inv.success === false) {
                return `- **Night ${inv.day}:** Investigated **${inv.target}** → ❌ Investigation failed/blocked`;
            }
            const status = inv.isEvil ? '🔴 **EVIL**' : '✓ Innocent';
            return `- **Night ${inv.day}:** Investigated **${inv.target}** → ${status}`;
        }).join('\n');

        // Only count successful investigations (exclude kills)
        const evilPlayers = bot.roleKnowledge.investigations
            .filter(inv => inv.success !== false && inv.isEvil && inv.actionType !== 'kill')
            .map(inv => inv.target);

        const clearedPlayers = bot.roleKnowledge.investigations
            .filter(inv => inv.success !== false && !inv.isEvil && inv.actionType !== 'kill')
            .map(inv => inv.target);

        const killUsed = bot.roleKnowledge.investigations.some(inv => inv.actionType === 'kill');

        let summary = `## 🔍 Your Detective Action Results\n\n${investigationLines}`;

        if (evilPlayers.length > 0) {
            summary += `\n\n**DETECTED AS EVIL (werewolf or maniac):** ${evilPlayers.join(', ')}`;
        }
        if (clearedPlayers.length > 0) {
            summary += `\n**CLEARED PLAYERS:** ${clearedPlayers.join(', ')}`;
        }
        if (killUsed) {
            summary += `\n\n⚠️ **Your one-time kill ability has been used.**`;
        }

        sections.push(summary);
    }

    // Doctor protections
    if (bot.role === GAME_ROLES.DOCTOR && bot.roleKnowledge.protections && bot.roleKnowledge.protections.length > 0) {
        const protectionLines = bot.roleKnowledge.protections.map(prot => {
            // Handle unsuccessful protections (blocked by some future role)
            if (prot.success === false) {
                return `- **Night ${prot.day}:** Tried to protect **${prot.target}** → ❌ Protection failed/blocked (target was abducted)`;
            }
            // Handle kill actions
            if (prot.actionType === 'kill') {
                return `- **Night ${prot.day}:** Used DOCTOR'S MISTAKE to kill **${prot.target}** 💀`;
            }
            const savedNote = prot.savedTarget === true ? ' 🛡️ (SAVED THEM from werewolves!)' : '';
            return `- **Night ${prot.day}:** Protected **${prot.target}**${savedNote}`;
        }).join('\n');

        const lastProtection = bot.roleKnowledge.protections[bot.roleKnowledge.protections.length - 1];

        let summary = `## 🏥 Your Doctor Protection History\n\n${protectionLines}`;
        if (lastProtection.success !== false && lastProtection.actionType !== 'kill') {
            summary += `\n\n**REMINDER:** You protected **${lastProtection.target}** last night, so you CANNOT protect them again tonight.`;
        }

        sections.push(summary);
    }

    // Maniac abductions
    if (bot.role === GAME_ROLES.MANIAC && bot.roleKnowledge.abductions && bot.roleKnowledge.abductions.length > 0) {
        const abductionLines = bot.roleKnowledge.abductions.map(abd => {
            if (abd.maniacDied) {
                return `- **Night ${abd.day}:** Abducted **${abd.target}** → 💀 You died, and ${abd.target} died with you!`;
            }
            if (!abd.success) {
                return `- **Night ${abd.day}:** Tried to abduct **${abd.target}** → ❌ Abduction failed`;
            }
            return `- **Night ${abd.day}:** Abducted **${abd.target}** 🎭 (blocked any actions involving them)`;
        }).join('\n');

        const lastAbduction = bot.roleKnowledge.abductions[bot.roleKnowledge.abductions.length - 1];

        let summary = `## 🎭 Your Maniac Abduction History\n\n${abductionLines}`;
        if (lastAbduction.success) {
            summary += `\n\n**REMINDER:** You abducted **${lastAbduction.target}** last night, so you CANNOT abduct them again tonight.`;
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

    // 2. Chronological day-by-day history: GM day summary → Voting → Night narrative (with facts)
    const maxDay = game.currentDay || 1;
    const dayEntries: string[] = [];

    for (let day = 1; day <= maxDay; day++) {
        const dayParts: string[] = [];

        // GM day discussion summary
        const daySummary = (game.dayDiscussionSummaries || []).find(s => s.day === day);
        if (daySummary) {
            dayParts.push(`**Discussion:** ${daySummary.summary}`);
        }

        // Voting history for this day
        const vote = (game.votingHistory || []).find(v => v.day === day);
        if (vote) {
            let voteText = '**Voting:**\n';
            if (vote.votes && vote.votes.length > 0) {
                const sortedVotes = [...vote.votes].sort((a, b) => a.order - b.order);
                sortedVotes.forEach(v => {
                    voteText += `  ${v.order}. ${v.voter} → ${v.target}\n`;
                });
            } else {
                const voteStr = Object.entries(vote.voteCounts)
                    .map(([name, count]) => `${name}: ${count} vote(s)`)
                    .join(', ');
                voteText += `  ${voteStr}\n`;
            }
            const eliminated = vote.eliminatedPlayer
                ? `  Result: ${vote.eliminatedPlayer} eliminated (was ${vote.eliminatedPlayerRole})`
                : '  Result: No elimination';
            voteText += eliminated;
            dayParts.push(voteText);
        }

        // Night narrative + factual summary for this day
        const night = (game.nightNarratives || []).find(n => n.day === day);
        if (night) {
            let nightText = `**Night ${day} Story:**\n${night.narrative}`;

            // Append chronological night events if available
            if (night.events && night.events.length > 0) {
                const eventLines = night.events.map(e => `${e.order + 1}. [${e.role}] ${e.description}`);
                nightText += `\n**Night ${day} Events (in order):**\n${eventLines.join('\n')}`;
            }
            dayParts.push(nightText);
        }

        if (dayParts.length > 0) {
            dayEntries.push(`### Day ${day}\n${dayParts.join('\n\n')}`);
        }
    }

    if (dayEntries.length > 0) {
        sections.push(`## Game History\n\n${dayEntries.join('\n\n---\n\n')}`);
    }

    // 3. Bot's Personal Summary (LAST - bot's own interpretation)
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