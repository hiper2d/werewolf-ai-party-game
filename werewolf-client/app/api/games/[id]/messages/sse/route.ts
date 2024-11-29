import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL, GameMessage, MessageType} from "@/app/api/game-models";

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
                        const message: GameMessage = {
                            id: change.doc.id,
                            recipientName: data.recipientName,
                            authorName: data.authorName,
                            msg: data.msg,
                            messageType: data.messageType,
                            day: data.day || 1,
                            timestamp: data.timestamp || Date.now()
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
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