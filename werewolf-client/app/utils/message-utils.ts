import {AIMessage, GAME_MASTER, GameMessage, MESSAGE_ROLE, MessageType} from "@/app/api/game-models";

/**
 * Converts message content to a human-readable string format
 * Handles different message types appropriately to prevent "[object Object]" display
 */
export function convertMessageContent(message: GameMessage): string {
    if (typeof message.msg === 'string') {
        return message.msg;
    }

    switch (message.messageType) {
        case MessageType.VOTE_MESSAGE:
            const voteMsg = message.msg as { who: string; why: string };
            return `Votes for ${voteMsg.who}: "${voteMsg.why}"`;
        
        case MessageType.BOT_ANSWER:
            const botMsg = message.msg as { reply: string };
            return botMsg.reply;
        
        case MessageType.GAME_STORY:
            const storyMsg = message.msg as { story: string };
            return storyMsg.story;
        
        case MessageType.SYSTEM_ERROR:
        case MessageType.SYSTEM_WARNING:
            const errorMsg = message.msg as { error: string; details: string };
            return `${errorMsg.error}: ${errorMsg.details}`;
        
        default:
            // Fallback to JSON string for unknown types
            return JSON.stringify(message.msg);
    }
}

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
    currentBotName: string,
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
        gmMessages.splice(0, gmMessages.length); // clear
        
        const aiMessage = {role: MESSAGE_ROLE.USER, content: fullGmMessage.trim()};
        aiMessages.push(aiMessage);
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
            flushGmMessages(currentBotName, gmMessages, otherPlayerMessages, aiMessages);

            // Prepare own message (assistant type)
            if (message.messageType === MessageType.BOT_ANSWER) {
                content = (message.msg as { reply: string }).reply;
            } else {
                content = message.msg as string;
            }
            const aiMessage = { role: MESSAGE_ROLE.ASSISTANT, content: content };
            aiMessages.push(aiMessage);
        } else {
            // Use convertMessageContent to properly handle all message types
            content = convertMessageContent(message);
            // Add to otherPlayerMessages as a name/message pair
            otherPlayerMessages.push({ name: message.authorName, message: content });
        }
    }));

    flushGmMessages(currentBotName, gmMessages, otherPlayerMessages, aiMessages);
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

export function parseResponseToObj(response: string, expectedType?: string): any {
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

    let parsedObj: any;
    try {
        parsedObj = JSON.parse(cleanResponse);
    } catch (e) {
        const { BotResponseError } = require('@/app/api/game-models');
        throw new BotResponseError(
            'Failed to parse bot response as JSON',
            `Invalid JSON format: ${(e as Error).message}`,
            {
                originalResponse: response,
                cleanedResponse: cleanResponse,
                expectedType: expectedType || 'unknown'
            },
            true
        );
    }

    // Validate required fields based on expected type
    if (expectedType) {
        const { BotResponseError } = require('@/app/api/game-models');
        
        switch (expectedType) {
            case 'BotAnswer':
                if (!parsedObj.reply || typeof parsedObj.reply !== 'string') {
                    throw new BotResponseError(
                        'Bot response missing required "reply" field',
                        'BotAnswer responses must contain a valid "reply" string field',
                        {
                            parsedResponse: parsedObj,
                            expectedType: expectedType,
                            missingField: 'reply'
                        },
                        true
                    );
                }
                break;
                
            case 'VoteMessage':
                if (!parsedObj.who || typeof parsedObj.who !== 'string') {
                    throw new BotResponseError(
                        'Vote response missing required "who" field',
                        'VoteMessage responses must contain a valid "who" string field',
                        {
                            parsedResponse: parsedObj,
                            expectedType: expectedType,
                            missingField: 'who'
                        },
                        true
                    );
                }
                if (!parsedObj.why || typeof parsedObj.why !== 'string') {
                    throw new BotResponseError(
                        'Vote response missing required "why" field',
                        'VoteMessage responses must contain a valid "why" string field',
                        {
                            parsedResponse: parsedObj,
                            expectedType: expectedType,
                            missingField: 'why'
                        },
                        true
                    );
                }
                break;
        }
    }

    return parsedObj;
}

/**
 * Generates a natural language summary of voting results
 * @param results - Record of player names to vote counts
 * @returns Formatted voting results message
 */
export function generateVotingResultsMessage(results: Record<string, number>): string {
    // Handle no votes case
    const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
    if (totalVotes === 0) {
        return "No votes were cast during this round.";
    }

    // Find highest vote count and players
    const maxVotes = Math.max(...Object.values(results));
    const topPlayers = Object.entries(results)
        .filter(([_, count]) => count === maxVotes)
        .map(([name]) => name);

    // Format results
    const resultLines = Object.entries(results)
        .filter(([_, count]) => count > 0)
        .map(([name, count]) => `${name}: ${count} vote${count !== 1 ? 's' : ''}`)
        .join('\n');

    // Handle ties
    if (topPlayers.length > 1) {
        return `Voting results (tie):\n${resultLines}\n\nThere is a tie between ${topPlayers.join(', ')}!`;
    }

    return `Voting results:\n${resultLines}\n\n${topPlayers[0]} received the most votes and will be eliminated.`;
}