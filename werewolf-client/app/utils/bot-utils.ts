import { Bot, Game, GAME_ROLES, GAME_STATES, PLAY_STYLES, PLAY_STYLE_CONFIGS, RoleKnowledge } from "@/app/api/game-models";
import { botAnswerFormatLine } from "@/app/ai/bot-turn";
import { botNightReminderPostfix, botReminderPostfix, botSystemPrompt, BOT_AFTER_GAME_SYSTEM_PROMPT_ADDITION, replyLengthInstruction } from "@/app/ai/prompts/bot-prompts";
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
 * The lines describing a bot's OWN night action on one night (empty for roles without one,
 * and for nights the bot did not act). One night's lines never change once written, so
 * they sit inside that day's history entry; tonight's ride in the turn tail.
 */
export function roleKnowledgeLinesForDay(bot: Bot, day: number): string[] {
    const k = bot.roleKnowledge;
    if (!k) return [];
    const lines: string[] = [];

    if (bot.role === GAME_ROLES.DETECTIVE) {
        for (const inv of (k.investigations || []).filter(e => e.day === day)) {
            if (inv.actionType === 'kill') {
                lines.push(`Used ONE-TIME KILL on **${inv.target}** 🗡️`);
            } else if (inv.success === false) {
                // Blocked by another role; the cause is never named
                lines.push(`Investigated **${inv.target}** → ❌ Investigation failed/blocked`);
            } else {
                lines.push(`Investigated **${inv.target}** → ${inv.isEvil ? '🔴 **EVIL**' : '✓ Innocent'}`);
            }
        }
    }

    if (bot.role === GAME_ROLES.DOCTOR) {
        for (const prot of (k.protections || []).filter(e => e.day === day)) {
            if (prot.success === false) {
                lines.push(`Tried to protect **${prot.target}** → ❌ Protection failed`);
            } else if (prot.actionType === 'kill') {
                lines.push(`Used DOCTOR'S MISTAKE to kill **${prot.target}** 💀`);
            } else {
                lines.push(`Protected **${prot.target}**${prot.savedTarget === true ? ' 🛡️ (SAVED THEM from werewolves!)' : ''}`);
            }
        }
    }

    if (bot.role === GAME_ROLES.MANIAC) {
        for (const abd of (k.abductions || []).filter(e => e.day === day)) {
            if (abd.maniacDied) {
                lines.push(`Abducted **${abd.target}** → 💀 You died, and ${abd.target} died with you!`);
            } else if (!abd.success) {
                lines.push(`Tried to abduct **${abd.target}** → ❌ Abduction failed`);
            } else {
                lines.push(`Abducted **${abd.target}** 🎭 (blocked any actions involving them)`);
            }
        }
    }

    if (bot.role === GAME_ROLES.WEREWOLF) {
        // The pack's shared record, same on every werewolf
        for (const atk of (k.attacks || []).filter(e => e.day === day)) {
            const outcome = atk.outcome === 'killed'
                ? `💀 ${atk.target} died`
                : atk.outcome === 'survived'
                    ? `❌ ${atk.target} survived (the doctor protected them)`
                    : '❌ Attack failed';
            lines.push(`Attacked **${atk.target}** → ${outcome}`);
        }
    }

    return lines;
}

/** "**Your night action:** …" for one night, or '' when the bot has nothing recorded. */
function formatOwnNightAction(bot: Bot, day: number): string {
    const lines = roleKnowledgeLinesForDay(bot, day);
    if (lines.length === 0) return '';
    const label = bot.role === GAME_ROLES.WEREWOLF ? "Your pack's night attack" : 'Your night action';
    return lines.length === 1
        ? `**${label}:** ${lines[0]}`
        : `**${label}:**\n${lines.map(l => `- ${l}`).join('\n')}`;
}

/**
 * What a night role must keep in view across nights, derived from its whole record: the
 * detective's found/cleared lists and spent kill, the doctor's and maniac's "not the same
 * target twice in a row". It changes every night, so it rides in the turn tail, never in
 * the system prompt.
 */
export function generateRoleStatus(bot: Bot, game: Game): string {
    const k = bot.roleKnowledge;
    if (!k) return '';
    const today = game.currentDay || 1;
    const lines: string[] = [];

    if (bot.role === GAME_ROLES.DETECTIVE && k.investigations?.length) {
        const checks = k.investigations.filter(inv => inv.success !== false && inv.actionType !== 'kill');
        const evil = checks.filter(inv => inv.isEvil).map(inv => inv.target);
        const cleared = checks.filter(inv => !inv.isEvil).map(inv => inv.target);
        if (evil.length > 0) lines.push(`**DETECTED AS EVIL (werewolf or maniac):** ${evil.join(', ')}`);
        if (cleared.length > 0) lines.push(`**CLEARED PLAYERS:** ${cleared.join(', ')}`);
        if (k.investigations.some(inv => inv.actionType === 'kill')) {
            lines.push('⚠️ **Your one-time kill ability has been used.**');
        }
    }

    // "Last night … not again tonight" only holds before tonight has resolved: once it has
    // (the end-of-day summary), the latest entry IS tonight and the rule points a day ahead.
    if (bot.role === GAME_ROLES.DOCTOR && k.protections?.length) {
        const last = k.protections[k.protections.length - 1];
        if ((last.day ?? 0) < today && last.success !== false && last.actionType !== 'kill') {
            lines.push(`**REMINDER:** You protected **${last.target}** last night, so you CANNOT protect them again tonight.`);
        }
    }

    if (bot.role === GAME_ROLES.MANIAC && k.abductions?.length) {
        const last = k.abductions[k.abductions.length - 1];
        if ((last.day ?? 0) < today && last.success) {
            lines.push(`**REMINDER:** You abducted **${last.target}** last night, so you CANNOT abduct them again tonight.`);
        }
    }

    return lines.length > 0 ? `## Your Role Status\n${lines.join('\n')}` : '';
}

/** A bot's own notes for one day: the per-day entry, or the legacy index-based array. */
function personalNotesForDay(bot: Bot, day: number): string {
    const entry = (bot.personalSummaries || []).find(s => s.day === day);
    if (entry?.summary?.trim()) return entry.summary.trim();
    const legacy = bot.daySummaries?.[day - 1];
    return legacy?.trim() || '';
}

/**
 * One completed day as a history entry: the day and the night that followed it. Every part
 * is final before the next day starts, so an entry never changes once it is in the prompt.
 */
function formatDayEntry(bot: Bot, game: Game, day: number): string {
    const parts: string[] = [];

    const daySummary = (game.dayDiscussionSummaries || []).find(s => s.day === day);
    if (daySummary) {
        parts.push(`**Discussion:** ${daySummary.summary}`);
    }

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
        voteText += vote.eliminatedPlayer
            ? `  Result: ${vote.eliminatedPlayer} eliminated (was ${vote.eliminatedPlayerRole})`
            : '  Result: No elimination';
        parts.push(voteText);
    }

    // The GM's public night story only. Private outcomes reach a role through its own
    // night-action line below.
    const night = (game.nightNarratives || []).find(n => n.day === day);
    if (night) {
        parts.push(`**Night ${day} Story:**\n${night.narrative}`);
    }

    const chapter = (game.storyChapters || []).find(c => c.day === day);
    if (chapter?.summary) {
        parts.push(`**Story chapter:** ${chapter.summary}`);
    }

    const ownAction = formatOwnNightAction(bot, day);
    if (ownAction) {
        parts.push(ownAction);
    }

    const notes = personalNotesForDay(bot, day);
    if (notes) {
        parts.push(`**Your notes:**\n${notes}`);
    }

    return parts.length > 0 ? `### Day ${day}\n${parts.join('\n\n')}` : '';
}

/**
 * Generates the context section of the bot SYSTEM prompt: an append-only list of history
 * entries, one per completed day. An entry covers the day and the night after it — the
 * GM's discussion summary, the vote, the night story, the story chapter, the bot's own
 * night action and the bot's own notes (its end-of-day summary).
 *
 * Append-only on purpose. A provider's prompt cache matches on an exact prefix, so:
 * - nothing of the CURRENT day is here (it is in the day's messages; what changes during
 *   the day and is not a message rides in the turn tail, see generateBotTurnState), which
 *   keeps the system prompt byte-identical from the first discussion turn to the summary;
 * - a new day only ADDS an entry at the end, so yesterday's whole system prompt is still a
 *   prefix of today's. Nothing may be placed after the entries, and nothing that is
 *   rewritten day to day may be placed before them.
 * The end-of-day summary is the compaction step: the day's messages drop out and one entry
 * takes their place. Before 2026-11-12 the bot rewrote ONE consolidated summary each day
 * and the role knowledge and latest chapter were separate sections, so every new day
 * changed text in front of the history.
 *
 * @param bot The current bot
 * @param game The game state
 * @returns Formatted context section or empty string
 */
export function generateBotContextSection(bot: Bot, game: Game): string {
    const sections: string[] = [];
    const today = game.currentDay || 1;

    // Games started before per-day notes: the last consolidated summary, frozen as written.
    if (bot.summary?.trim()) {
        sections.push(`## Your Earlier Notes\n\n${bot.summary.trim()}`);
    }

    const dayEntries: string[] = [];
    for (let day = 1; day < today; day++) {
        const entry = formatDayEntry(bot, game, day);
        if (entry) dayEntries.push(entry);
    }
    if (dayEntries.length > 0) {
        sections.push(`## Game History\n\n${dayEntries.join('\n\n---\n\n')}`);
    }

    return sections.length > 0 ? '\n\n' + sections.join('\n\n') : '';
}

/**
 * The part of a bot's knowledge that changes DURING a day or from night to night, for the
 * per-turn tail: who is alive and dead right now, the result of tonight's own night action
 * once the night has resolved (it is not a chat message, and the end-of-day summary needs
 * it), and the role's running status. Rebuilt on every turn and never saved, so it never
 * sits in front of cached history.
 */
export function generateBotTurnState(bot: Bot, game: Game): string {
    const today = game.currentDay || 1;
    const dead = game.bots
        .filter(b => !b.isAlive)
        .map(b => `${b.name} (${b.role})`)
        .join(", ");
    let state = `## Current Game State\n**Alive Players:** ${getAlivePlayerNames(game, bot.name)}\n**Dead Players:** ${dead || 'none'}`;
    const tonight = formatOwnNightAction(bot, today);
    if (tonight) {
        state += `\n\n## Tonight (Night ${today})\n${tonight}`;
    }
    const status = generateRoleStatus(bot, game);
    if (status) {
        state += `\n\n${status}`;
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

/** Which reminder follows the state in a turn tail, see buildBotTurnTail. */
export type BotTurnKind = 'table' | 'vote' | 'night' | 'night_talk' | 'summary';

/**
 * The trailing message of every bot turn. It rides after the GM command as its own user
 * message and is never persisted, so the saved history stays byte-stable for prompt caches
 * (providers that need alternating roles merge it back in prepareMessages).
 *
 * Structure: the current game state first (generateBotTurnState), then a reminder by kind:
 * - `table` (intro, discussion, post-game chat) and `vote`: playstyle, conversation
 *   continuity, decision reminder, reply length
 * - `night` (night actions) and `night_talk` (the werewolves' night chat): playstyle and
 *   decision reminder
 * - `summary` (end-of-day notes): no reminder
 * and last, on every kind: how to answer this turn (botAnswerFormatLine — which of the
 * shared answer fields to fill, or plain prose on providers without schema enforcement)
 * and the reply-language line.
 */
export function buildBotTurnTail(bot: Bot, game: Game, kind: BotTurnKind): string {
    const state = generateBotTurnState(bot, game);
    const aiType = getEffectiveModel(game, bot.name, bot.aiType).aiType;
    if (kind === 'summary') {
        return [state, botAnswerFormatLine(aiType, 'notes'), replyLanguageLine(game.language)]
            .map(s => s.trim()).filter(Boolean).join('\n\n');
    }
    const reminder = kind === 'night' || kind === 'night_talk'
        ? format(botNightReminderPostfix(game.gameMode, game.language), {
            play_style: generatePlayStyleDescription(bot),
            answer_format: botAnswerFormatLine(aiType, kind === 'night' ? 'night' : 'reply')
        })
        : format(botReminderPostfix(game.gameMode, game.language), {
            play_style: generatePlayStyleDescription(bot),
            human_player_name: game.humanPlayerName,
            reply_length_instruction: replyLengthInstruction(game.longReplies),
            answer_format: botAnswerFormatLine(aiType, kind === 'vote' ? 'vote' : 'reply')
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