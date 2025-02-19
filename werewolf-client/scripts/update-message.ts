import { addMessageToChatAndSaveToDb } from "../app/api/game-actions";
import { GameMessage } from "../app/api/game-models";

const gameId = process.argv[2];
const messageId = process.argv[3];
const messageJson = process.argv[4];

if (!gameId || !messageId || !messageJson) {
    console.error('Usage: update-message.ts <gameId> <messageId> \'{"reply": "new message"}\'');
    console.error('Example: update-message.ts game123 msg456 \'{"reply": "Hello world"}\'');
    process.exit(1);
}

try {
    const msgContent = JSON.parse(messageJson);
    const message: GameMessage = {
        id: messageId,
        recipientName: "ALL",
        authorName: "Game Master",
        msg: msgContent,
        messageType: "BOT_ANSWER",
        day: 1,
        timestamp: Date.now()
    };

    addMessageToChatAndSaveToDb(message, gameId)
        .then(() => console.log('Message updated successfully'))
        .catch(console.error);
} catch (e) {
    console.error('Error parsing message JSON:', e);
    process.exit(1);
}