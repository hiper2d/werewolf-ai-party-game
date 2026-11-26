import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/firebase/server';
import {isStarterTemplateVisible, STARTER_GAMES_COLLECTION, starterAudioDocId} from '@/app/utils/starter-games';
import {isGameLanguage} from '@/app/ai/game-language';

/**
 * A pre-recorded voice clip of a starter game: the opening story or a character's
 * introduction (base64 MP3 in starterGames/{id}/audio/{clip}, recorded once by
 * scripts/record-starter-voices.ts). Public like the card picture: a visible template holds
 * nothing secret, and the clip is what every player of that story hears. The URL carries the
 * clip's version, so it can be cached for good. `?lang=` names a translation's take.
 */
export async function GET(request: NextRequest, {params}: {params: Promise<{id: string; clip: string}>}) {
    if (!db) {
        return NextResponse.json({error: 'Firestore is not initialized'}, {status: 500});
    }
    const {id, clip} = await params;
    // A clip key is `story` or a character name: one word of letters and digits (name-utils).
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !/^[\p{L}\p{N}\p{M}]{1,40}$/u.test(clip)) {
        return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    const lang = request.nextUrl.searchParams.get('lang') ?? undefined;
    if (lang !== undefined && !isGameLanguage(lang)) {
        return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    const templateRef = db.collection(STARTER_GAMES_COLLECTION).doc(id);
    const [template, audio] = await Promise.all([
        templateRef.get(),
        templateRef.collection('audio').doc(starterAudioDocId(clip, lang)).get(),
    ]);
    const stored = audio.data() as {data?: string; mime?: string} | undefined;
    if (!template.exists || !isStarterTemplateVisible(template.data()?.status, process.env.NODE_ENV === 'production') || !stored?.data) {
        return NextResponse.json({error: 'Not found'}, {status: 404});
    }
    return new NextResponse(Buffer.from(stored.data, 'base64'), {
        headers: {
            'Content-Type': stored.mime || 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
