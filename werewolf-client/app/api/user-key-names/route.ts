import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserApiKeys } from '@/app/api/user-actions';
import { getProvidedApiKeyNames } from '@/app/ai/model-limit-utils';

// Returns the list of apiKeyName values the user has configured (with non-empty values).
// We deliberately do NOT return key values to the client.
export async function GET() {
    const session = await auth();
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const apiKeys = await getUserApiKeys(session.user.email);
        const provided = Array.from(getProvidedApiKeyNames(apiKeys));
        return NextResponse.json({ providedKeys: provided });
    } catch (error: any) {
        console.error('Failed to retrieve user API key names', error);
        return NextResponse.json({ providedKeys: [] }, { status: 200 });
    }
}
