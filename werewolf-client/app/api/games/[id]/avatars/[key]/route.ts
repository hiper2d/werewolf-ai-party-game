import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {ensureUserCanAccessGame} from '@/app/api/tier-guards';
import {AVATAR_VARIANTS_COLLECTION, avatarVariantKey} from '@/app/api/game-models';

/**
 * Serves a generated character avatar (stored as base64 JPEG in the
 * games/{id}/avatars/{key} subcollection — no Storage bucket needed), or one of
 * that character's other portrait candidates with ?n=<index>.
 * Immutable per version, so clients may cache aggressively.
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

    // ?n= serves a specific portrait candidate instead of the selected one, so
    // the character card's arrows can show an alternate immediately while the
    // selection write lands in the background.
    const variantParam = request.nextUrl.searchParams.get('n');
    const variantIndex = variantParam === null ? null : parseInt(variantParam, 10);
    const gameDoc = db.collection('games').doc(gameId);
    const doc = variantIndex !== null && Number.isInteger(variantIndex) && variantIndex >= 0
        ? await gameDoc.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, variantIndex)).get()
        : await gameDoc.collection('avatars').doc(key).get();
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
