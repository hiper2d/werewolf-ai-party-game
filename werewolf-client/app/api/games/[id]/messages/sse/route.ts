import {NextRequest} from 'next/server';
import db from "@/config/firebase";
import {collection, onSnapshot, orderBy, query, where} from "firebase/firestore";


export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const gameId = params.id;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const q = query(
                collection(db, `messages`),
                where('gameId', '==', gameId),
                orderBy('timestamp', 'asc')
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
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