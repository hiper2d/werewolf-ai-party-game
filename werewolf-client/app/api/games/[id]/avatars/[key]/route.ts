import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {ensureUserCanAccessGame} from '@/app/api/tier-guards';

/**
 * Serves a generated character avatar (stored as base64 JPEG in the
 * games/{id}/avatars/{key} subcollection — no Storage bucket needed).
 * Immutable per game, so clients may cache aggressively.
 */
export async function GET(request: NextRequest, {params}: {params: Promise<{id: string, key: string}>}) {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({error: 'Not authenticated'}, {status: 401});
    }
    if (!db) {
        return NextResponse.json({error: 'Firestore is not initialized'}, {status: 500});
    }

    const {id: gameId, key} = await params;
    await ensureUserCanAccessGame(gameId, session.user.email);

    const doc = await db.collection('games').doc(gameId).collection('avatars').doc(key).get();
    // Docs without `data` are in-flight claim placeholders (mid-game
    // illustrations write those before the image bytes) — treat as absent.
    if (!doc.exists || !(doc.data() as any)?.data) {
        return NextResponse.json({error: 'Avatar not found'}, {status: 404});
    }
    const {data, mime} = doc.data() as {data: string, mime: string};

    return new NextResponse(Buffer.from(data, 'base64'), {
        headers: {
            'Content-Type': mime || 'image/jpeg',
            'Cache-Control': 'private, max-age=86400, immutable',
        },
    });
}
