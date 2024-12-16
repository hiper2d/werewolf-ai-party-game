import {AIMessage, GameMessage, GAME_MASTER, MessageType} from "@/app/api/game-models";

/**
 * Converts an array of GameMessages to AIMessages, handling the message history appropriately.
 * 
 * @param messages - Array of game messages to convert
 * @param systemInstruction - Optional system instruction to prepend
 * @returns Array of AIMessages suitable for AI API communication
 */
export function convertToAIMessages(currentBotName: string, messages: GameMessage[]): AIMessage[] {
    const aiMessages: AIMessage[] = [];

    let lastGameMasterMessage: AIMessage | null = null;

    messages.forEach(message => {
        let formattedMessage: AIMessage;

        if (message.authorName === GAME_MASTER) {
            const content = message.messageType === MessageType.BOT_ANSWER 
                ? (message.msg as { reply: string }).reply 
                : message.messageType === MessageType.GAME_STORY 
                    ? (message.msg as { story: string }).story 
                    : message.msg as string;

            if (lastGameMasterMessage) {
                // Concatenate with the last game master message
                lastGameMasterMessage.content += `\n${content}`;
            } else {
                formattedMessage = { role: 'user', content: content };
                lastGameMasterMessage = formattedMessage;
                aiMessages.push(formattedMessage);
            }
        } else {
            // Other players' messages
            const content = message.messageType === MessageType.BOT_ANSWER 
                ? (message.msg as { reply: string }).reply 
                : message.messageType === MessageType.GAME_STORY 
                    ? (message.msg as { story: string }).story 
                    : message.msg as string;

            const playerMessage = `${message.authorName}: ${content}`;

            if (lastGameMasterMessage) {
                lastGameMasterMessage.content += `\n${playerMessage}`;
            } else {
                aiMessages.push({ role: 'assistant', content: content });
            }
        }
    });

    return aiMessages;
}

export function convertToAIMessage(message: GameMessage): AIMessage {
    return { role: 'user', content: message.msg }
}