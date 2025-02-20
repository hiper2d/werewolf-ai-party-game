import { db } from "../firebase/server";

const gameId = process.argv[2];
const messageId = process.argv[3];

if (!gameId || !messageId) {
    console.error('Please provide a game ID and a message ID');
    console.error('Usage: delete-message.ts <gameId> <messageId>');
    process.exit(1);
}

async function deleteMessage(gameId: string, messageId: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        const messageRef = db.collection('games').doc(gameId).collection('messages').doc(messageId);
        const doc = await messageRef.get();

        if (!doc.exists) {
            console.error(`Message with ID ${messageId} not found in game ${gameId}`);
            return;
        }

        await messageRef.delete();
        console.log(`Message with ID ${messageId} deleted successfully from game ${gameId}`);
    } catch (error) {
        console.error('Error deleting message:', error);
        process.exit(1);
    }
}

deleteMessage(gameId, messageId)
    .then(() => console.log('Message deletion completed'))
    .catch(console.error);