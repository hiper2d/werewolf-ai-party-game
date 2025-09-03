import { db } from "../firebase/server";

const sourceGameId = process.argv[2];
if (!sourceGameId) {
    console.error('Please provide a source game ID');
    process.exit(1);
}

async function copyGame(sourceGameId: string): Promise<string> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Get the source game
    const gameRef = db.collection('games').doc(sourceGameId);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
        throw new Error('Source game not found');
    }

    // Get all messages for the source game
    const messagesSnapshot = await gameRef.collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

    // Create the new game
    const newGameRef = db.collection('games').doc();
    const gameData = gameSnap.data();
    if (!gameData) {
        throw new Error('Source game data is empty');
    }
    await newGameRef.set(gameData);

    // Create a messages subcollection in the new game
    const messagesPromises = messagesSnapshot.docs.map(async (messageDoc) => {
        const newMessageRef = newGameRef.collection('messages').doc();
        return newMessageRef.set(messageDoc.data());
    });

    // Wait for all message promises to resolve
    await Promise.all(messagesPromises);

    return newGameRef.id;
}

copyGame(sourceGameId)
    .then(newGameId => console.log(`Game copied successfully. New game ID: ${newGameId}`))
    .catch(console.error);