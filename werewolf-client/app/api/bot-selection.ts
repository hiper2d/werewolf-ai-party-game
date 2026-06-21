import {
    BOT_SELECTION_CONFIG,
    BotResponseError,
    Game,
    GAME_MASTER,
    GAME_STATES,
    GameMessage,
    MessageType,
    RECIPIENT_NONE,
} from "@/app/api/game-models";
import { GM_ROUTER_SYSTEM_PROMPT } from "@/app/ai/prompts/gm-prompts";
import { GM_COMMAND_SELECT_RESPONDERS } from "@/app/ai/prompts/gm-commands";
import { GmBotSelectionZodSchema } from "@/app/ai/prompts/zod-schemas";
import { AgentFactory } from "@/app/ai/agent-factory";
import { format } from "@/app/ai/prompts/utils";
import { formatMessagesForBotSelection } from "@/app/utils/message-utils";
import { addMessageToChatAndSaveToDb, getGameMessages } from "@/app/api/game-actions";
import { recordGameMasterTokenUsage } from "@/app/api/cost-tracking";
import { logger } from "@/app/utils/logger";

/**
 * Format day activity data for the GM prompt.
 * Returns a human-readable string showing activity levels for each alive bot,
 * highlighting the 3 least active bots to encourage their inclusion.
 */
export function formatDayActivityData(game: Game): string {
    const activityCounter = game.dayActivityCounter || {};
    const aliveBots = game.bots.filter(bot => bot.isAlive);

    if (aliveBots.length === 0) {
        return "No alive bots to track activity.";
    }

    // Sort bots by message count (ascending) to identify least active
    const sortedBots = aliveBots
        .map(bot => ({ name: bot.name, count: activityCounter[bot.name] || 0 }))
        .sort((a, b) => a.count - b.count);

    // Get top 3 least active bot names
    const leastActiveNames = new Set(sortedBots.slice(0, 3).map(b => b.name));

    // Format with highlighting for least active
    const activityData = sortedBots.map(bot => {
        const highlight = leastActiveNames.has(bot.name) ? " ⚠️NEEDS TURN" : "";
        return `${bot.name}: ${bot.count} msgs${highlight}`;
    }).join(", ");

    return `Today's activity (sorted by participation) - ${activityData}`;
}

/**
 * Pick a few random alive bots to open a new day.
 *
 * Decides a random count (2-4, capped at the number of alive bots), then picks
 * that many alive bots at random. Saves a hidden GM_BOT_SELECTION debug message
 * for traceability and returns the selected names. No LLM call — at the start of
 * a day there is no discussion yet to route on, so a random nudge is enough to
 * keep the game from looking stuck waiting for the human.
 */
export async function selectRandomDayOpeningBots(game: Game): Promise<string[]> {
    const aliveBotNames = game.bots.filter(b => b.isAlive).map(b => b.name);
    if (aliveBotNames.length === 0) {
        return [];
    }

    // Decide the count first (2-4), capped at how many bots are actually alive
    const maxCount = Math.min(4, aliveBotNames.length);
    const minCount = Math.min(2, maxCount);
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));

    // Shuffle (Fisher-Yates) and take the first `count`
    const shuffled = [...aliveBotNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, count);

    // Save selection as a hidden debug message (mirrors the GM-router path)
    const selectionMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_NONE,
        authorName: GAME_MASTER,
        msg: `Random day-opening selection: [${selected.join(', ')}]`,
        messageType: MessageType.GM_BOT_SELECTION,
        day: game.currentDay,
        timestamp: null
    };
    await addMessageToChatAndSaveToDb(selectionMessage, game.id);

    logger.info(`🎲 Randomly selected ${selected.length} bots to open the day`, { gameId: game.id, selected });

    return selected;
}

/**
 * Ask the Game Master to select which bots should respond next.
 *
 * Runs the GM router over the current day's discussion, records GM token usage,
 * and saves a hidden GM_BOT_SELECTION debug message. Returns the selected bot
 * names (capped at BOT_SELECTION_CONFIG.MAX). Does NOT update the process queue
 * or handle auto-vote — callers decide what to do with the selection.
 */
export async function selectRespondingBots(
    game: Game,
    apiKeys: Record<string, string>,
    userEmail: string
): Promise<string[]> {
    const isAfterGameDiscussion = game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;

    // Get all messages for the current day to provide context to GM
    const messages = await getGameMessages(game.id);
    const dayMessages = messages.filter(m => m.day === game.currentDay);

    // For after-game discussion, include ALL bots (dead + alive)
    // For regular discussion, only include alive bots
    const availableBots = isAfterGameDiscussion ? game.bots : game.bots.filter(b => b.isAlive);

    const gmPrompt = format(GM_ROUTER_SYSTEM_PROMPT, {
        alive_players_with_roles: [
            ...availableBots.map(b => `${b.name} (${b.role})`),
            `${game.humanPlayerName} (${game.humanPlayerRole})`
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", "),
        humanPlayerName: game.humanPlayerName,
        day_activity_data: formatDayActivityData(game)
    });

    // Prepare candidate list for the command - bots only (human excluded)
    const candidateNames = availableBots
        .filter(b => b.name !== game.humanPlayerName)
        .map(b => b.name)
        .join(", ");

    const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys, false);
    gmAgent.gameId = game.id;
    gmAgent.userId = userEmail;
    const selectionCommand = format(GM_COMMAND_SELECT_RESPONDERS, { candidate_names: candidateNames });

    // Include recent conversation in the GM's history for bot selection
    const history = formatMessagesForBotSelection(dayMessages, selectionCommand);
    const [gmResponse, , tokenUsage] = await gmAgent.askWithZodSchema(GmBotSelectionZodSchema, history);
    if (!gmResponse) {
        throw new BotResponseError(
            'Game Master failed to select responding bots',
            'GM did not respond to bot selection request',
            { gmAiType: game.gameMasterAiType, action: 'bot_selection' },
            true
        );
    }

    // Update game master's token usage
    if (tokenUsage) {
        await recordGameMasterTokenUsage(game.id, tokenUsage, userEmail);
    }
    if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
        throw new BotResponseError(
            'Game Master provided invalid bot selection',
            'GM response format was invalid or missing selected_bots array',
            { gmAiType: game.gameMasterAiType, response: gmResponse },
            true
        );
    }

    // Validate that all selected names are valid bots (and not the human player)
    const validNames = availableBots.map(b => b.name);
    for (const name of gmResponse.selected_bots) {
        if (!validNames.includes(name)) {
            throw new BotResponseError(
                `Game Master selected invalid bot: ${name}`,
                `The GM attempted to select a player that is not available or does not exist: "${name}". Valid candidates: ${validNames.join(', ')}`,
                { gmAiType: game.gameMasterAiType, invalidName: name, validNames },
                true
            );
        }
    }

    // Limit to configured max
    const selectedBots = gmResponse.selected_bots.slice(0, BOT_SELECTION_CONFIG.MAX);

    // Save GM bot selection as a hidden debug message
    const selectionMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_NONE,
        authorName: GAME_MASTER,
        msg: `Selected: [${selectedBots.join(', ')}]. Reasoning: ${gmResponse.reasoning || 'none'}`,
        messageType: MessageType.GM_BOT_SELECTION,
        day: game.currentDay,
        timestamp: null
    };
    await addMessageToChatAndSaveToDb(selectionMessage, game.id);

    logger.info(`🧭 GM selected ${selectedBots.length} bots to respond`, { gameId: game.id, selectedBots });

    return selectedBots;
}
