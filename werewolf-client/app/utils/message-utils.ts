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
        role = 'user';
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

    let currentGMMessage: string | null = null;
    let otherPlayersMessages: string[] = [];
    
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const isGM = message.authorName === GAME_MASTER;
        const content = message.messageType === MessageType.BOT_ANSWER 
            ? (message.msg as { reply: string }).reply 
            : message.messageType === MessageType.GAME_STORY 
                ? (message.msg as { story: string }).story 
                : message.msg as string;

        if (isGM) {
            // If we have other players' messages, append them to the current GM message
            if (otherPlayersMessages.length > 0) {
                currentGMMessage = `${currentGMMessage}\n\nMessages from other players you haven't yet seen:\n${otherPlayersMessages.join('\n')}`;
                otherPlayersMessages = [];
            }
            
            // Start new GM message or append to existing
            currentGMMessage = currentGMMessage ? `${currentGMMessage}\n${content}` : content;
        } else {
            const playerMessage = `${message.authorName}: ${content}`;
            
            // If this is a bot message and we have a pending GM message, add both as a pair
            if (message.messageType === MessageType.BOT_ANSWER) {
                if (currentGMMessage) {
                    aiMessages.push({ role: 'user', content: currentGMMessage });
                    currentGMMessage = null;
                }
                aiMessages.push({ role: 'assistant', content });
                otherPlayersMessages = [];
            } else {
                otherPlayersMessages.push(playerMessage);
            }
        }
    }
    
    // Handle any remaining messages
    if (currentGMMessage) {
        if (otherPlayersMessages.length > 0) {
            currentGMMessage = `${currentGMMessage}\n\nMessages from other players:\n${otherPlayersMessages.join('\n')}`;
        }
        aiMessages.push({ role: 'user', content: currentGMMessage });
    }
    
    return aiMessages;
}