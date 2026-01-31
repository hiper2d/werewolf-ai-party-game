import {NextRequest} from 'next/server';
import {db} from "@/firebase/server";
import {RECIPIENT_ALL, RECIPIENT_WEREWOLVES, RECIPIENT_DOCTOR, RECIPIENT_DETECTIVE, RECIPIENT_MANIAC, GameMessage, MessageType, GAME_ROLES} from "@/app/api/game-models";
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

    // Get human player role from game
    const humanPlayerRole = game.humanPlayerRole;

    const stream = new ReadableStream({
        async start(controller) {
            if (!db) {
                throw new Error('Firestore is not initialized');
            }

            // Build recipient list based on user's role
            const allowedRecipients = [RECIPIENT_ALL];
            
            // Add personal and role-specific messages for authenticated user
            allowedRecipients.push(game.humanPlayerName);
            
            // Add role-specific recipients
            if (humanPlayerRole === GAME_ROLES.WEREWOLF) {
                allowedRecipients.push(RECIPIENT_WEREWOLVES);
            } else if (humanPlayerRole === GAME_ROLES.DOCTOR) {
                allowedRecipients.push(RECIPIENT_DOCTOR);
            } else if (humanPlayerRole === GAME_ROLES.DETECTIVE) {
                allowedRecipients.push(RECIPIENT_DETECTIVE);
            } else if (humanPlayerRole === GAME_ROLES.MANIAC) {
                allowedRecipients.push(RECIPIENT_MANIAC);
            }

            // Create single query with proper chronological ordering
            const query = db.collection('games').doc(gameId).collection('messages')
                .where('recipientName', 'in', allowedRecipients)
                .orderBy('timestamp', 'asc');

            const unsubscribeCallbacks: Array<() => void> = [];

            // Set up listener for single query
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
                            timestamp: data.timestamp || Date.now(),
                            cost: data.cost
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
                    }
                });
            }, error => {
                console.error('SSE: Firestore listener error:', error);
            });
            unsubscribeCallbacks.push(unsubscribe);

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