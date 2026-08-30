import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {auth} from '@/auth';
import {AVATAR_DRAFTS_COLLECTION, AVATAR_VARIANTS_COLLECTION, avatarVariantKey} from '@/app/api/game-models';
import {avatarDraftIdFor} from '@/app/utils/avatar-drafts';

/**
 * Serves an image from the current user's illustration draft (the set drawn
 * on the new-game preview): a portrait or scene by key, or a portrait
 * candidate with ?n=<index>. The draft is addressed by the session's email, so
 * there is nothing to authorize beyond being signed in — no one can name
 * another user's draft. Same caching contract as the game avatar route.
 */
export async function GET(request: NextRequest, {params}: {params: Promise<{key: string}>}) {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({error: 'Not authenticated'}, {status: 401});
    }
    if (!db) {
        return NextResponse.json({error: 'Firestore is not initialized'}, {status: 500});
    }

    const {key} = await params;
    const variantParam = request.nextUrl.searchParams.get('n');
    const variantIndex = variantParam === null ? null : parseInt(variantParam, 10);
    const draftRef = db.collection(AVATAR_DRAFTS_COLLECTION).doc(avatarDraftIdFor(session.user.email));
    const doc = variantIndex !== null && Number.isInteger(variantIndex) && variantIndex >= 0
        ? await draftRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, variantIndex)).get()
        : await draftRef.collection('avatars').doc(key).get();
    if (!doc.exists || !(doc.data() as any)?.data) {
        return NextResponse.json({error: 'Image not found'}, {status: 404});
    }
    const {data, mime} = doc.data() as {data: string, mime: string};

    return new NextResponse(Buffer.from(data, 'base64'), {
        headers: {
            'Content-Type': mime || 'image/jpeg',
            'Cache-Control': 'private, max-age=86400, immutable',
        },
    });
}
