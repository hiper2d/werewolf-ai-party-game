import {NextResponse} from 'next/server';
import {auth} from '@/auth';
import {getUserTier} from '@/app/api/user-actions';

export async function GET() {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const tier = await getUserTier(session.user.email);
        return NextResponse.json({ tier });
    } catch (error: any) {
        console.error('Failed to retrieve user tier', error);
        return NextResponse.json({ tier: 'free' }, { status: 200 });
    }
}
