import {AIMessage, GameMessage, GAME_MASTER, MessageType, MESSAGE_ROLE} from "@/app/api/game-models";

/**
 * Converts an array of GameMessages to AIMessages, handling the message history appropriately.
 * 
 * @param messages - Array of game messages to convert
 * @param systemInstruction - Optional system instruction to prepend
 * @returns Array of AIMessages suitable for AI API communication
 */
export function convertToAIMessages(currentBotName: string, messages: GameMessage[]): AIMessage[] {
    const aiMessages: AIMessage[] = [];
    let gmMessage: string | null = null;
    let otherPlayerMessages: string[] = [];

    messages.forEach(message => {
        const content = message.messageType === MessageType.BOT_ANSWER 
            ? (message.msg as { reply: string }).reply 
            : message.msg as string;

        if (message.authorName === GAME_MASTER) {
            if (gmMessage) {
                // Concatenate with the last game master message
                gmMessage += `\n${content}`;
            } else {
                gmMessage = content;
            }
        } else if (message.authorName === currentBotName) {
            // If we have a GM message and other player messages, combine them before adding the bot's message
            if (gmMessage) {
                if (otherPlayerMessages.length > 0) {
                    gmMessage += '\n\nMessages from other players:\n' + otherPlayerMessages.join('\n');
                    otherPlayerMessages = [];
                }
                aiMessages.push({ role: 'user', content: gmMessage });
                gmMessage = null;
            }
            aiMessages.push({ role: 'assistant', content });
        } else {
            // Messages from other players/bots
            const playerMessage = `${message.authorName}: ${content}`;
            otherPlayerMessages.push(playerMessage);
        }
    });

    // Handle any remaining messages at the end
    if (gmMessage !== null) {
        const currentGmMessage = gmMessage;  // This creates a new variable that TypeScript knows is definitely a string
        if (otherPlayerMessages.length > 0) {
            gmMessage = currentGmMessage + '\n\nMessages from other players:\n' + otherPlayerMessages.join('\n');
        }
        aiMessages.push({ role: MESSAGE_ROLE.USER, content: gmMessage });
    }

    return aiMessages;
}

export function convertToAIMessage(message: GameMessage): AIMessage {
    return {
        role: MESSAGE_ROLE.USER,
        content: String(message.msg)
    };
}

export function cleanResponse(response: string): string {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
    }

    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
    }

    return cleanResponse.trim();
}

export function parseResponseToObj(response: string): any {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
    }

    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
    }

    cleanResponse = cleanResponse.trim();

    try {
        return JSON.parse(cleanResponse);
    } catch (e) {
        console.log('Failed to parse JSON, returning as string:', cleanResponse);
        return cleanResponse;
    }
}