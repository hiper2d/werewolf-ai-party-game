import { buildLlmsFullTxt } from '@/app/llms/content';

// Same as /llms.txt: built from source constants, so it can be fully static.
export const dynamic = 'force-static';

export function GET(): Response {
    return new Response(buildLlmsFullTxt(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
