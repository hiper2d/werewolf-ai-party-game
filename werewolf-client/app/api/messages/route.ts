import { NextRequest } from 'next/server';
import db from "@/config/firebase";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { Message } from "@/models/messages";

export async function GET(request: NextRequest, { params }: { params: { gameId: string } }) {
    const gameId = params?.gameId;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const q = query(collection(db, `messages`), orderBy('timestamp', 'asc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                snapshot.forEach((doc) => {

                });

                /*snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const message = Message.fromFirestore(change.doc.data(), change.doc.id);
                        const data = `data: ${JSON.stringify(message)}\n\n`;

                    }
                });*/
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const message = Message.fromFirestore(change.doc.id, change.doc.data());
                        controller.enqueue(message.text);
                    }
                });
            });

            // Clean up function
            return () => unsubscribe();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}