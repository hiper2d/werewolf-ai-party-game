'use server';

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {ensureUserCanAccessGame} from '@/app/api/tier-guards';
import {getGame} from '@/app/api/game-actions';
import {GameMessage, RECIPIENT_ALL, RECIPIENT_WEREWOLVES, RECIPIENT_DOCTOR, RECIPIENT_DETECTIVE, GAME_ROLES} from '@/app/api/game-models';

export async function GET(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ error: 'Firestore is not initialized' }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dayParam = searchParams.get('day');
    const day = dayParam ? Number(dayParam) : NaN;

    if (!dayParam || Number.isNaN(day) || day < 1) {
        return NextResponse.json({ error: 'Invalid day parameter' }, { status: 400 });
    }

    const {id: gameId} = await params;

    await ensureUserCanAccessGame(gameId, session.user.email);

    const game = await getGame(gameId);
    if (!game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Build recipient list based on user's role
    const allowedRecipients = [RECIPIENT_ALL];
    
    // Add personal and role-specific messages for authenticated user
    allowedRecipients.push(game.humanPlayerName);
    
    // Add role-specific recipients
    const humanPlayerRole = game.humanPlayerRole;
    if (humanPlayerRole === GAME_ROLES.WEREWOLF) {
        allowedRecipients.push(RECIPIENT_WEREWOLVES);
    } else if (humanPlayerRole === GAME_ROLES.DOCTOR) {
        allowedRecipients.push(RECIPIENT_DOCTOR);
    } else if (humanPlayerRole === GAME_ROLES.DETECTIVE) {
        allowedRecipients.push(RECIPIENT_DETECTIVE);
    }

    try {
        // Query all messages visible to the user using the existing index (recipientName + timestamp)
        // We filter by day in memory to avoid needing a complex composite index (day + recipientName + timestamp)
        const snapshot = await db
            .collection('games')
            .doc(gameId)
            .collection('messages')
            .where('recipientName', 'in', allowedRecipients)
            .orderBy('timestamp', 'asc')
            .get();

        const messages: GameMessage[] = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    recipientName: data.recipientName,
                    authorName: data.authorName,
                    msg: data.msg,
                    messageType: data.messageType,
                    day: data.day || 1,
                    timestamp: data.timestamp || Date.now(),
                    cost: data.cost
                } as GameMessage;
            })
            // Filter by day in memory
            .filter(msg => msg.day === day);

        return NextResponse.json(messages);
    } catch (error) {
        console.error('Failed to fetch messages for day', day, error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
}
