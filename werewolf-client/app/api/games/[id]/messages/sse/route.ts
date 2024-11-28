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
    console.log('SSE: Starting connection for game:', gameId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }

            console.log('SSE: Setting up Firestore listener');
            const q = db.collection('games').doc(gameId).collection('messages')
                .where('recipientName', '==', RECIPIENT_ALL)
                .orderBy('timestamp', 'asc');

            const unsubscribe = q.onSnapshot((snapshot) => {
                console.log('SSE: Received snapshot with', snapshot.docChanges().length, 'changes');
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        console.log('SSE: New message added:', change.doc.id);
                        const data = change.doc.data();
                        const firestoreMessage = {
                            id: change.doc.id,
                            ...data,
                            timestamp: data.timestamp || Date.now(),
                        } as FirestoreGameMessage;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(firestoreMessage)}\n\n`));
                    }
                });
            }, error => {
                console.error('SSE: Firestore listener error:', error);
            });

            request.signal.addEventListener('abort', () => {
                console.log('SSE: Connection closed');
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