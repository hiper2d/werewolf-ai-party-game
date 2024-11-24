import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL} from "@/app/ai/ai-models";


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
                .where('recipient', '==', RECIPIENT_ALL)
                .orderBy('timestamp', 'desc');

            const unsubscribe = q.onSnapshot( (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const message = { id: change.doc.id, ...change.doc.data() };
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