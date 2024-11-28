import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL, FirestoreGameMessage, GameMessage, MessageType} from "@/app/api/game-models";
import {BotAnswer, GameStory} from "@/app/api/game-models";

function deserializeMessage(firestoreMessage: FirestoreGameMessage): GameMessage {
    try {
        // For GAME_MASTER_ASK and HUMAN_PLAYER_MESSAGE, msg is a string
        // For BOT_ANSWER and GAME_STORY, msg is already an object from Firestore
        return {
            recipientName: firestoreMessage.recipientName,
            authorName: firestoreMessage.authorName,
            role: firestoreMessage.role,
            msg: firestoreMessage.msg,  // Keep as is - either string or object
            messageType: firestoreMessage.messageType
        };
    } catch (error) {
        console.error('Error deserializing message:', error);
        throw new Error(`Failed to deserialize message: ${error}`);
    }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const gameId = params.id;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }

            const q = db.collection('messages')
                .where('gameId', '==', gameId)
                .where('recipientName', '==', RECIPIENT_ALL)
                .orderBy('timestamp', 'asc');

            const unsubscribe = q.onSnapshot( (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const firestoreMessage = {
                            id: change.doc.id,
                            ...change.doc.data()
                        } as FirestoreGameMessage;
                        const message = deserializeMessage(firestoreMessage);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
                    }
                });
            });

            request.signal.addEventListener('abort', () => {
                unsubscribe();
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}