import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {SCENE_WELCOME_KEY} from '@/app/api/game-models';
import {STARTER_GAMES_COLLECTION} from '@/app/utils/starter-games';

/**
 * The card picture of a starter game: its welcome scene (base64 JPEG in
 * starterGames/{id}/avatars/scene-welcome). Public on purpose: a live template is shown on
 * the start screen and holds nothing secret. Draft templates are not served.
 */
export async function GET(_request: NextRequest, {params}: {params: Promise<{id: string}>}) {
    if (!db) {
        return NextResponse.json({error: 'Firestore is not initialized'}, {status: 500});
    }
    const {id} = await params;
    if (!/^[a-z0-9-]{1,40}$/.test(id)) {
        return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    const templateRef = db.collection(STARTER_GAMES_COLLECTION).doc(id);
    const [template, scene] = await Promise.all([
        templateRef.get(),
        templateRef.collection('avatars').doc(SCENE_WELCOME_KEY).get(),
    ]);
    const image = scene.data() as {data?: string; mime?: string} | undefined;
    if (!template.exists || template.data()?.status !== 'live' || !image?.data) {
        return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    return new NextResponse(Buffer.from(image.data, 'base64'), {
        headers: {
            'Content-Type': image.mime || 'image/jpeg',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
