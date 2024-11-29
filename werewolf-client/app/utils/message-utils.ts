import {GameMessage} from "@/app/api/game-models";
import {OpenAI} from "openai";
import ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * Formats a list of bot messages into a single text block with each message on a new line
 */
function formatBotMessages(messages: GameMessage[]): string {
    return messages
        .map(msg => `${msg.authorName}: ${msg.msg}`)
        .join('\n');
}

/**
 * Converts game messages into a format suitable for bot's chat history.
 * The resulting history will have:
 * - System message with bot's instruction
 * - GM messages as "user" role, including other bots' messages as text blocks
 * - Bot's own messages as "assistant" role
 * 
 * @param messages - List of game messages to process
 * @param botName - Name of the bot for which to prepare the history
 * @param systemInstruction - System instruction for the bot
 */
export function convertGameMessagesToBotHistory(
    messages: GameMessage[],
    botName: string,
    systemInstruction: string
): ChatCompletionMessageParam[] {
    const openAiMessages = new Array<ChatCompletionMessageParam>();
    openAiMessages.push({role: 'system', content: systemInstruction});

    let currentGmMessage = '';
    let pendingBotMessages: GameMessage[] = [];

    for (const msg of messages) {
        if (msg.authorName === 'Game Master') {
            if (pendingBotMessages.length > 0) {
                currentGmMessage += '\n\nOther players said:\n' + formatBotMessages(pendingBotMessages);
                pendingBotMessages = [];
            }
            openAiMessages.push({
                role: 'user',
                content: currentGmMessage ? currentGmMessage : msg.msg
            });
            currentGmMessage = '';
        } else if (msg.authorName === botName) {
            openAiMessages.push({
                role: 'assistant',
                content: msg.msg
            });
        } else {
            pendingBotMessages.push(msg);
        }
    }

    // Handle any remaining bot messages
    if (pendingBotMessages.length > 0 && currentGmMessage) {
        currentGmMessage += '\n\nOther players said:\n' + formatBotMessages(pendingBotMessages);
        openAiMessages.push({
            role: 'user',
            content: currentGmMessage
        });
    }

    return openAiMessages;
}
