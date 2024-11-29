import {AIMessage, GameMessage, GAME_MASTER, MessageType} from "@/app/api/game-models";
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
 * Converts a GameMessage to an AIMessage format suitable for AI API communication.
 * 
 * @param message - The game message to convert
 * @returns AIMessage with appropriate role and content
 */
export function convertToAIMessage(message: GameMessage): AIMessage {
    let role: 'system' | 'user' | 'assistant';
    
    // Determine the role based on message type and author
    if (message.authorName === GAME_MASTER) {
        role = message.messageType === MessageType.GAME_STORY ? 'system' : 'user';
    } else {
        role = 'assistant';
    }

    // Handle different message types for content
    let content: string;
    if (message.messageType === MessageType.BOT_ANSWER) {
        content = (message.msg as { reply: string }).reply;
    } else if (message.messageType === MessageType.GAME_STORY) {
        content = (message.msg as { story: string }).story;
    } else {
        content = message.msg as string;
    }

    return { role, content };
}

/**
 * Converts an array of GameMessages to AIMessages, handling the message history appropriately.
 * 
 * @param messages - Array of game messages to convert
 * @param systemInstruction - Optional system instruction to prepend
 * @returns Array of AIMessages suitable for AI API communication
 */
export function convertToAIMessages(messages: GameMessage[], systemInstruction?: string): AIMessage[] {
    const aiMessages: AIMessage[] = [];
    
    // Add system instruction if provided
    if (systemInstruction) {
        aiMessages.push({ role: 'system', content: systemInstruction });
    }
    
    // Convert each game message
    messages.forEach(message => {
        aiMessages.push(convertToAIMessage(message));
    });
    
    return aiMessages;
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
