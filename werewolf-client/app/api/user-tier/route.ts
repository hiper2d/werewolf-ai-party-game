import {NextResponse} from 'next/server';
import {auth} from '@/auth';
import {getUserTier, getVoiceProvider} from '@/app/api/user-actions';

export async function GET() {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const [tier, voiceProvider] = await Promise.all([
            getUserTier(session.user.email),
            getVoiceProvider(session.user.email).catch(() => undefined),
        ]);
        return NextResponse.json({ tier, voiceProvider });
    } catch (error: any) {
        console.error('Failed to retrieve user tier', error);
        return NextResponse.json({ tier: 'free' }, { status: 200 });
    }
}
