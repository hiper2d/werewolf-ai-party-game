import { db } from "../firebase/server";
import { GameMessage } from "../app/api/game-models";

async function getGameMessages(gameId: string): Promise<GameMessage[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const messagesSnapshot = await db.collection('games')
        .doc(gameId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

    return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        recipientName: doc.data().recipientName,
        authorName: doc.data().authorName,
        msg: doc.data().msg,
        messageType: doc.data().messageType,
        day: doc.data().day,
        timestamp: doc.data().timestamp
    }));
}

const gameId = process.argv[2];
const messageId = process.argv[3];

if (!gameId || !messageId) {
    console.error('Please provide a game ID and a message ID');
    console.error('Usage: delete-messages-after.ts <gameId> <messageId>');
    process.exit(1);
}

async function deleteMessagesAfter(gameId: string, messageId: string): Promise<void> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    try {
        // Get all messages to find the target message
        const messages = await getGameMessages(gameId);
        const messageIndex = messages.findIndex(msg => msg.id === messageId);

        if (messageIndex === -1) {
            console.error(`Message with ID ${messageId} not found in game ${gameId}`);
            return;
        }

        // Get all messages that come after the specified message
        const messagesToDelete = messages.slice(messageIndex + 1);
        
        if (messagesToDelete.length === 0) {
            console.log('No messages found after the specified message ID');
            return;
        }

        // Delete messages individually
        const messagesRef = db.collection('games').doc(gameId).collection('messages');
        
        const deletePromises = messagesToDelete.map(message => {
            const messageRef = messagesRef.doc(message.id!);
            return messageRef.delete();
        });

        // Execute all deletions
        await Promise.all(deletePromises);
        console.log(`Successfully deleted ${messagesToDelete.length} messages after message ${messageId}`);
    } catch (error) {
        console.error('Error deleting messages:', error);
        process.exit(1);
    }
}

deleteMessagesAfter(gameId, messageId)
    .then(() => console.log('Message deletion completed'))
    .catch(console.error);