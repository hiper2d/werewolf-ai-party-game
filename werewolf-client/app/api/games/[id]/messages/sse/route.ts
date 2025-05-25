import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL, GameMessage, MessageType} from "@/app/api/game-models";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const gameId = resolvedParams.id;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }

            const q = db.collection('games').doc(gameId).collection('messages')
                .where('recipientName', '==', RECIPIENT_ALL)
                .orderBy('timestamp', 'asc');

            const unsubscribe = q.onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
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