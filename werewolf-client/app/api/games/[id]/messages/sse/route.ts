import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL, RECIPIENT_WEREWOLVES, RECIPIENT_DOCTOR, RECIPIENT_DETECTIVE, GameMessage, MessageType, GAME_ROLES} from "@/app/api/game-models";
import {auth} from "@/auth";
import {getGame, getUserFromFirestore} from "@/app/api/game-actions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const gameId = resolvedParams.id;
    const encoder = new TextEncoder();

    // Get user session
    const session = await auth();
    if (!session || !session.user?.email) {
        return new Response('Unauthorized', { status: 401 });
    }

    // Get game data to check if user is the human player and get their role
    const game = await getGame(gameId);
    if (!game) {
        return new Response('Game not found', { status: 404 });
    }

    // Get user data to match with game
    const user = await getUserFromFirestore(session.user.email);
    if (!user) {
        return new Response('User not found', { status: 404 });
    }

    // Check if this user is the human player for this game
    const isHumanPlayer = game.humanPlayerName === user.name;
    const humanPlayerRole = isHumanPlayer ? game.humanPlayerRole : null;

    const stream = new ReadableStream({
        async start(controller) {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }

            // Build queries based on user's role
            const queries = [];
            const unsubscribeCallbacks: Array<() => void> = [];

            // Always include public messages
            const publicQuery = db.collection('games').doc(gameId).collection('messages')
                .where('recipientName', '==', RECIPIENT_ALL)
                .orderBy('timestamp', 'asc');
            queries.push(publicQuery);

            // Add personal messages if user is the human player
            if (isHumanPlayer) {
                const personalQuery = db.collection('games').doc(gameId).collection('messages')
                    .where('recipientName', '==', game.humanPlayerName)
                    .orderBy('timestamp', 'asc');
                queries.push(personalQuery);

                // Add role-specific messages
                if (humanPlayerRole === GAME_ROLES.WEREWOLF) {
                    const werewolfQuery = db.collection('games').doc(gameId).collection('messages')
                        .where('recipientName', '==', RECIPIENT_WEREWOLVES)
                        .orderBy('timestamp', 'asc');
                    queries.push(werewolfQuery);
                } else if (humanPlayerRole === GAME_ROLES.DOCTOR) {
                    const doctorQuery = db.collection('games').doc(gameId).collection('messages')
                        .where('recipientName', '==', RECIPIENT_DOCTOR)
                        .orderBy('timestamp', 'asc');
                    queries.push(doctorQuery);
                } else if (humanPlayerRole === GAME_ROLES.DETECTIVE) {
                    const detectiveQuery = db.collection('games').doc(gameId).collection('messages')
                        .where('recipientName', '==', RECIPIENT_DETECTIVE)
                        .orderBy('timestamp', 'asc');
                    queries.push(detectiveQuery);
                }
            }

            // Set up listeners for all queries
            queries.forEach((query) => {
                const unsubscribe = query.onSnapshot((snapshot) => {
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
                unsubscribeCallbacks.push(unsubscribe);
            });

            request.signal.addEventListener('abort', () => {
                unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
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