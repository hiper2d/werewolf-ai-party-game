import { db } from "../firebase/server";
import { writeFile } from 'fs/promises';
import { join } from 'path';

async function getGameMessages(gameId: string) {
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
if (!gameId) {
    console.error('Please provide a game ID');
    process.exit(1);
}

getGameMessages(gameId)
    .then(async messages => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = join(process.cwd(), 'werewolf-client', 'logs', `game-messages-${gameId}-${timestamp}.json`);
        await writeFile(outputPath, JSON.stringify(messages, null, 2));
        console.log(`Messages written to: ${outputPath}`);
    })
    .catch(console.error);