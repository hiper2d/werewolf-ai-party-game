import {AIMessage, GameMessage, GAME_MASTER, MessageType, MESSAGE_ROLE} from "@/app/api/game-models";

/**
 * Converts an array of GameMessages to AIMessages, handling the message history appropriately.
 * 
 * @param messages - Array of game messages to convert
 * @param systemInstruction - Optional system instruction to prepend
 * @returns Array of AIMessages suitable for AI API communication
 */
/**
 * Calculates a hash for a message to identify duplicates
 */
function calculateMessageHash(message: GameMessage): string {
    // Extract message content, stringify if not a string
    const msgContent = typeof message.msg === 'string'
        ? message.msg
        : JSON.stringify(message.msg);
    
    // If the author is GAME_MASTER, include both author and content in the hash
    // Otherwise, only include the author name
    if (message.authorName === GAME_MASTER) {
        return `${message.authorName}|${msgContent}`;
    } else {
        return `${message.authorName}`;
    }
}

function flushGmMessages(
    gmMessages: Array<string>,
    otherPlayerMessages: { name: string; message: string }[],
    aiMessages: AIMessage[]
) {
    if (gmMessages.length > 0) {
        let gmBlock: string = gmMessages.join("\n\n");
        let otherPlayerConcatBlock = "";
        if (otherPlayerMessages.length > 0) {
            otherPlayerConcatBlock = `Below are messages from the other players you haven't yet seen. Each message with it's own tag with the player name attribute:\n<NewMessagesFromOtherPlayers>\n`;
            otherPlayerConcatBlock += otherPlayerMessages
                .map(pair => `  <Player name="${pair.name}">${pair.message}</Player>`)
                .join('\n');
            otherPlayerConcatBlock += `\n</NewMessagesFromOtherPlayers>`;
            otherPlayerMessages.splice(0, otherPlayerMessages.length);
        }
        let fullGmMessage = gmBlock += "\n\n" + otherPlayerConcatBlock;
        gmMessages.splice(0, gmMessages.length);
        aiMessages.push({role: MESSAGE_ROLE.USER, content: fullGmMessage.trim()});
    };
}

export function convertToAIMessages(currentBotName: string, messages: GameMessage[]): AIMessage[] {
    let otherPlayerMessages: { name: string, message: string }[] = [];
    let gmMessages: Array<string> = [];
    let aiMessages: AIMessage[] = [];

    // Track the hash of the last processed message
    let lastMessageHash: string | null = null;
    
    messages.forEach(((message, index) => {
        // Calculate hash for current message
        const currentHash = calculateMessageHash(message);
        
        // Check if this message is a duplicate of the previous one
        const isDuplicate = lastMessageHash === currentHash;
        
        // Remember this message's hash for next iteration
        lastMessageHash = currentHash;
        
        // If it's a duplicate, skip processing it
        if (isDuplicate) {
            return;
        }
        
        let content: string;

        if (message.authorName === GAME_MASTER) {
            if (message.messageType === MessageType.GAME_STORY) {
                content = (message.msg as { story: string }).story;
            } else {
                content = message.msg as string;
            }
            gmMessages.push(content);
        } else if (message.authorName === currentBotName) {
            // Flush GM and other players messages
            flushGmMessages(gmMessages, otherPlayerMessages, aiMessages);

            // Prepare own message (assistant type)
            if (message.messageType === MessageType.BOT_ANSWER) {
                content = (message.msg as { reply: string }).reply;
            } else {
                content = message.msg as string;
            }
            aiMessages.push({ role: MESSAGE_ROLE.ASSISTANT, content: content });
        } else {
            // Check if the message from another bot
            if (message.messageType === MessageType.BOT_ANSWER) {
                content = (message.msg as { reply: string }).reply;
                // Add to otherPlayerMessages as a name/message pair
                otherPlayerMessages.push({ name: message.authorName, message: content });
            } else {
                // Must it be from the human player then
                content = message.msg as string;
                // Add to otherPlayerMessages as a name/message pair
                otherPlayerMessages.push({ name: message.authorName, message: content });
            }
        }
    }));

    flushGmMessages(gmMessages, otherPlayerMessages, aiMessages);
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