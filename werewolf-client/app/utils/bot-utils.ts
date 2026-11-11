import { Bot, Game, GAME_ROLES, GAME_STATES, PLAY_STYLES, PLAY_STYLE_CONFIGS, RoleKnowledge } from "@/app/api/game-models";
import { latestChapterSummary } from "@/app/utils/story-utils";
import { botReminderPostfix, botSystemPrompt, BOT_AFTER_GAME_SYSTEM_PROMPT_ADDITION, replyLengthInstruction } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { replyLanguageLine } from "@/app/ai/game-language";
import { assertProviderNotBlocked } from "@/app/api/provider-blocks";

/**
 * Builds the comma-separated list of ALIVE players for the "Alive Players" line of
 * the bot system prompt. Excludes dead players, an optional self name, and a dead
 * human (humanPlayerIsAlive is treated as alive when absent, for legacy games).
 *
 * @param game The game state
 * @param excludeName Optional name to omit (typically the bot whose prompt this is)
 * @returns Comma-separated alive player names
 */
export function getAlivePlayerNames(game: Game, excludeName?: string): string {
    return [
        ...game.bots
            .filter(b => b.isAlive && b.name !== excludeName)
            .map(b => b.name),
        ...(game.humanPlayerIsAlive !== false && game.humanPlayerName !== excludeName
            ? [game.humanPlayerName]
            : [])
    ].join(", ");
}

/**
 * Resolves the model to use for a player's next AI request, honoring a pending
 * one-shot modelOverride ("Retry with different model" on the error banner).
 * Works for bots and the Game Master alike; falls back to the stored model.
 *
 * Every AI call in the game resolves its model here right before creating the agent, so
 * this is also where a provider the game has blocked (see provider-blocks.ts) is stopped:
 * it throws ProviderBlockedError before anything is sent. A plain Retry on a refused bot,
 * another bot of the same provider whose turn comes later, the Game Master's narration and
 * the night role calls all go through this one check.
 */
export function getEffectiveModel(
    game: Game,
    playerName: string,
    baseModel: string,
    baseThinking?: boolean
): { aiType: string; enableThinking: boolean } {
    const override = game.modelOverride;
    const resolved = override && override.botName === playerName && override.model
        ? { aiType: override.model, enableThinking: override.enableThinking ?? false }
        : { aiType: baseModel, enableThinking: baseThinking ?? false };
    assertProviderNotBlocked(game, resolved.aiType);
    return resolved;
}

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
 * Which nights of a bot's role knowledge to render. `beforeDay` keeps the nights of earlier
 * days (the part that is fixed for the whole current day and lives in the system prompt);
 * `fromDay` keeps the night of the current day (it lands after the night resolves, so it
 * rides in the per-turn tail). An entry without a day is treated as old.
 */
export interface RoleKnowledgeRange {
    beforeDay?: number;
    fromDay?: number;
}

function inRoleKnowledgeRange(day: number | undefined, range: RoleKnowledgeRange | undefined): boolean {
    if (!range) return true;
    const d = day ?? 0;
    if (range.beforeDay !== undefined && d >= range.beforeDay) return false;
    if (range.fromDay !== undefined && d < range.fromDay) return false;
    return true;
}

/**
 * Generates role-specific knowledge section based on the bot's role
 * This provides clear, structured information about night action results
 *
 * @param bot The current bot
 * @param range Optional: only the nights in this range (see RoleKnowledgeRange)
 * @returns Formatted role knowledge section or empty string
 */
export function generateRoleKnowledgeSection(bot: Bot, range?: RoleKnowledgeRange): string {
    if (!bot.roleKnowledge) {
        return '';
    }

    // The "latest night" rendering (range.fromDay) is read right after that night, at the
    // end-of-day summary: the "you did X last night, not again tonight" reminders would point
    // at the wrong night there, so they are left to the next day's system prompt.
    const latestOnly = range?.fromDay !== undefined;
    const titleSuffix = latestOnly ? ' (latest night)' : '';
    const knowledge: RoleKnowledge = {
        ...bot.roleKnowledge,
        investigations: bot.roleKnowledge.investigations?.filter(e => inRoleKnowledgeRange(e.day, range)),
        protections: bot.roleKnowledge.protections?.filter(e => inRoleKnowledgeRange(e.day, range)),
        abductions: bot.roleKnowledge.abductions?.filter(e => inRoleKnowledgeRange(e.day, range)),
        attacks: bot.roleKnowledge.attacks?.filter(e => inRoleKnowledgeRange(e.day, range)),
    };

    const sections: string[] = [];

    // Detective investigations
    if (bot.role === GAME_ROLES.DETECTIVE && knowledge.investigations && knowledge.investigations.length > 0) {
        const investigationLines = knowledge.investigations.map(inv => {
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
        const evilPlayers = knowledge.investigations
            .filter(inv => inv.success !== false && inv.isEvil && inv.actionType !== 'kill')
            .map(inv => inv.target);

        const clearedPlayers = knowledge.investigations
            .filter(inv => inv.success !== false && !inv.isEvil && inv.actionType !== 'kill')
            .map(inv => inv.target);

        const killUsed = knowledge.investigations.some(inv => inv.actionType === 'kill');

        let summary = `## 🔍 Your Detective Action Results${titleSuffix}\n\n${investigationLines}`;

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
    if (bot.role === GAME_ROLES.DOCTOR && knowledge.protections && knowledge.protections.length > 0) {
        const protectionLines = knowledge.protections.map(prot => {
            // Handle unsuccessful protections (blocked by some future role)
            if (prot.success === false) {
                return `- **Night ${prot.day}:** Tried to protect **${prot.target}** → ❌ Protection failed`;
            }
            // Handle kill actions
            if (prot.actionType === 'kill') {
                return `- **Night ${prot.day}:** Used DOCTOR'S MISTAKE to kill **${prot.target}** 💀`;
            }
            const savedNote = prot.savedTarget === true ? ' 🛡️ (SAVED THEM from werewolves!)' : '';
            return `- **Night ${prot.day}:** Protected **${prot.target}**${savedNote}`;
        }).join('\n');

        const lastProtection = knowledge.protections[knowledge.protections.length - 1];

        let summary = `## 🏥 Your Doctor Protection History${titleSuffix}\n\n${protectionLines}`;
        if (!latestOnly && lastProtection.success !== false && lastProtection.actionType !== 'kill') {
            summary += `\n\n**REMINDER:** You protected **${lastProtection.target}** last night, so you CANNOT protect them again tonight.`;
        }

        sections.push(summary);
    }

    // Maniac abductions
    if (bot.role === GAME_ROLES.MANIAC && knowledge.abductions && knowledge.abductions.length > 0) {
        const abductionLines = knowledge.abductions.map(abd => {
            if (abd.maniacDied) {
                return `- **Night ${abd.day}:** Abducted **${abd.target}** → 💀 You died, and ${abd.target} died with you!`;
            }
            if (!abd.success) {
                return `- **Night ${abd.day}:** Tried to abduct **${abd.target}** → ❌ Abduction failed`;
            }
            return `- **Night ${abd.day}:** Abducted **${abd.target}** 🎭 (blocked any actions involving them)`;
        }).join('\n');

        const lastAbduction = knowledge.abductions[knowledge.abductions.length - 1];

        let summary = `## 🎭 Your Maniac Abduction History${titleSuffix}\n\n${abductionLines}`;
        if (!latestOnly && lastAbduction.success) {
            summary += `\n\n**REMINDER:** You abducted **${lastAbduction.target}** last night, so you CANNOT abduct them again tonight.`;
        }

        sections.push(summary);
    }

    // Werewolf attacks (the pack's shared history)
    if (bot.role === GAME_ROLES.WEREWOLF && knowledge.attacks && knowledge.attacks.length > 0) {
        const attackLines = knowledge.attacks.map(atk => {
            const outcome = atk.outcome === 'killed'
                ? `💀 ${atk.target} died`
                : atk.outcome === 'survived'
                    ? `❌ ${atk.target} survived (the doctor protected them)`
                    : '❌ Attack failed';
            return `- **Night ${atk.day}:** Attacked **${atk.target}** → ${outcome}`;
        }).join('\n');
        sections.push(`## 🐺 Your Pack's Attack History${titleSuffix}\n\n${attackLines}`);
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
}

/**
 * Generates the context section of the bot SYSTEM prompt:
 * - Role-specific knowledge (investigations, protections, etc.)
 * - Day-by-day history (GM discussion summary, votes, night story)
 * - The GM's latest story chapter
 * - Bot's personal summary
 *
 * Everything here is cut at the START of the current day (completed days only), so the
 * system prompt stays byte-identical from the first discussion turn through the vote, the
 * night action and the end-of-day summary — the prefix a provider's prompt cache matches on.
 * What happens today is already in the day's messages; what changes during the day and is
 * not a message (alive/dead lists, tonight's role results) rides in the per-turn tail, see
 * generateBotTurnState. Before 2026-11-11 today's vote, night story, chapter and role
 * results were added here as they happened, which changed the system prompt ahead of the
 * whole day's history and made every later call that day a cache miss.
 *
 * @param bot The current bot
 * @param game The game state
 * @returns Formatted context section or empty string
 */
export function generateBotContextSection(bot: Bot, game: Game): string {
    const sections: string[] = [];
    const today = game.currentDay || 1;

    // 1. Role-Specific Knowledge (FIRST - most important for special roles)
    const roleKnowledge = generateRoleKnowledgeSection(bot, { beforeDay: today });
    if (roleKnowledge) {
        sections.push(roleKnowledge);
    }

    // 2. Chronological day-by-day history: GM day summary → Voting → Night narrative (with facts)
    const dayEntries: string[] = [];

    for (let day = 1; day < today; day++) {
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
                    const reason = v.reason?.trim();
                    voteText += `  ${v.order}. ${v.voter} → ${v.target}${reason ? `: "${reason}"` : ''}\n`;
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

        // Night story for this day — the GM's public narrative only. Private
        // outcomes reach each role through its own role-knowledge section.
        const night = (game.nightNarratives || []).find(n => n.day === day);
        if (night) {
            dayParts.push(`**Night ${day} Story:**\n${night.narrative}`);
        }

        if (dayParts.length > 0) {
            dayEntries.push(`### Day ${day}\n${dayParts.join('\n\n')}`);
        }
    }

    if (dayEntries.length > 0) {
        sections.push(`## Game History\n\n${dayEntries.join('\n\n---\n\n')}`);
    }

    // 2b. The GM's chronicle — current plot state, for tone only. Strategy stays fact-based.
    const latestChapter = latestChapterSummary(game, today);
    if (latestChapter) {
        sections.push(`## The Story So Far (Game Master's chronicle)

${latestChapter}

**How to use this:** let the chronicle color your tone, imagery, and small asides — nod to its events, react to its twist, push the tale a little further (about one sentence of flavor per message, never more). The chronicle is FICTION layered over the game: its twists, omens, and events imply NOTHING about any player's role and must NEVER be used as evidence, suspicion, or a reason to vote. Your reasoning and votes come only from game facts.`);
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
 * The part of a bot's knowledge that changes DURING a day, for the per-turn tail: who is
 * alive and dead right now, plus the results of tonight's own night action once the night
 * has resolved (they are not chat messages, and the end-of-day summary needs them).
 * Rebuilt on every turn and never saved, so it never sits in front of cached history.
 */
export function generateBotTurnState(bot: Bot, game: Game): string {
    const dead = game.bots
        .filter(b => !b.isAlive)
        .map(b => `${b.name} (${b.role})`)
        .join(", ");
    let state = `## Current Game State\n**Alive Players:** ${getAlivePlayerNames(game, bot.name)}\n**Dead Players:** ${dead || 'none'}`;
    const tonight = generateRoleKnowledgeSection(bot, { fromDay: game.currentDay || 1 });
    if (tonight) {
        state += `\n\n${tonight}`;
    }
    return state;
}

/**
 * The bot system prompt for any turn type (intro, discussion, vote, night action, summary,
 * post-game chat). ONE builder on purpose: a provider's prompt cache matches on an exact
 * prefix, so every call a bot makes during a day must send the same bytes here.
 */
export function buildBotSystemPrompt(bot: Bot, game: Game): string {
    const basePrompt = format(botSystemPrompt(game.gameMode, game.language), {
        name: bot.name,
        personal_story: bot.story,
        play_style: "",
        role: bot.role,
        human_player_name: game.humanPlayerName,
        werewolf_teammates_section: generateWerewolfTeammatesSection(bot, game),
        bot_context: generateBotContextSection(bot, game)
    });

    // Add after-game discussion mode instructions if game is over
    if (game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) {
        return basePrompt + BOT_AFTER_GAME_SYSTEM_PROMPT_ADDITION;
    }

    return basePrompt;
}

/**
 * The trailing message of every bot turn. It rides after the GM command as its own user
 * message and is never persisted, so the saved history stays byte-stable for prompt caches
 * (providers that need alternating roles merge it back in prepareMessages).
 *
 * Structure: the current game state first (generateBotTurnState), then — for turns that
 * speak at the table (`reminder: true`: intro, discussion, vote, post-game chat) — the
 * playstyle and decision reminder, which ends with the reply-language line. Night actions
 * and the end-of-day summary get the state and the language line only.
 */
export function buildBotTurnTail(bot: Bot, game: Game, options: { reminder: boolean }): string {
    const state = generateBotTurnState(bot, game);
    if (!options.reminder) {
        return `${state}\n\n${replyLanguageLine(game.language)}`.trim();
    }
    const reminder = format(botReminderPostfix(game.gameMode, game.language), {
        play_style: generatePlayStyleDescription(bot),
        human_player_name: game.humanPlayerName,
        reply_length_instruction: replyLengthInstruction(game.longReplies)
    });
    return `${state}\n\n${reminder.trim()}`;
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