import {AIMessage, GameMessage, GAME_MASTER, MessageType, MESSAGE_ROLE} from "@/app/api/game-models";

/**
 * Converts an array of GameMessages to AIMessages, handling the message history appropriately.
 * 
 * @param messages - Array of game messages to convert
 * @param systemInstruction - Optional system instruction to prepend
 * @returns Array of AIMessages suitable for AI API communication
 */
export function convertToAIMessages(currentBotName: string, messages: GameMessage[]): AIMessage[] {
    let gmMessage: string = "";
    let otherPlayerMessages: { name: string, message: string }[] = [];

    let aiMessages: AIMessage[] = [];
    
    messages.forEach(((message, index) => {
        let content: string;
/* fixme:
- There are 3 types of messages: from GM (user), from the current bot (assistant), from other players
- GM is considered to be the user for the LLM, the current bot is the assistant. Messages from other players should be appended to the GM's messages as the following text block:
    <NewMessagesFromOtherPlayers>
        <PlayerName1>: <Message1>
        <PlayerName2>: <Message2>
    </NewMessagesFromOtherPlayers>
- If there are multiple GM's messages in a row, they should be concatenated

The expected logic:
For each message do this
- Decide on the message type and correctly extract the content
- For the current bot message, convert it into the assistant type message
- For the other player message or human player message, remember it to the list of other player messages
- For GM message check if the next message is also from GM. If so, then remember the current GM message and proceed to the next one. If the next message it not from GM, then concatenate the current message with previously remembered GM messages if wny, append the block with messages from the other players if any, then convert the result into the user type message

After the whole history is converted it should be either empty or consists of the even number of messages where one user message is followed by on assistant message
*/
        // todo: New logic is here:
        if (message.authorName === GAME_MASTER) {
            if (message.messageType === MessageType.GAME_STORY) {
                content = (message.msg as { story: string }).story;
            } else {
                content = message.msg as string;
            }
            // check if the next message is from GM as well
            if (index < messages.length - 1 && messages[index+1].authorName === GAME_MASTER) {
                // if so, remember and skip
                gmMessage += "\n\n" + content;
            } else {
                // Prepare GM message from gmMessage and otherPlayerMessages (user type)
                let fullGmMessage = gmMessage + "\n\n" + content;
                if (otherPlayerMessages.length > 0) {
                    let otherPlayerConcatBlock = `Below are messages from the other players you haven't yet seen. Each message with it's own tag with the player name attribute:\n<NewMessagesFromOtherPlayers>\n`;
                    otherPlayerConcatBlock += otherPlayerMessages
                        .map(pair => `  <Player name="${pair.name}">${pair.message}</Player>`)
                        .join('\n');
                    otherPlayerConcatBlock += `\n</NewMessagesFromOtherPlayers>`;
                    fullGmMessage += "\n\n" + otherPlayerConcatBlock;
                    otherPlayerMessages = [];
                }
                aiMessages.push({ role: MESSAGE_ROLE.USER, content: fullGmMessage.trim() });
                gmMessage = "";
            }
        } else if (message.authorName === currentBotName) {
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