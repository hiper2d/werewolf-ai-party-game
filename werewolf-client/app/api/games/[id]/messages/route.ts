'use server';

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {ensureUserCanAccessGame} from '@/app/api/tier-guards';
import {getGame} from '@/app/api/game-actions';
import {GameMessage} from '@/app/api/game-models';
import {messagesForSession} from '@/app/api/game-session-view';

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

    try {
        // One day's messages, whoever they were for; who may read which is decided by the
        // same rule as everywhere else (messagesForSession), not by a second list here.
        const snapshot = await db
            .collection('games')
            .doc(gameId)
            .collection('messages')
            .where('day', '==', day)
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
            .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

        return NextResponse.json(await messagesForSession(game, messages));
    } catch (error) {
        console.error('Failed to fetch messages for day', day, error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
}
