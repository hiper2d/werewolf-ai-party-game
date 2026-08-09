import { buildLlmsTxt } from '@/app/llms/content';

// The content is derived entirely from source constants, so it only changes on
// deploy — prerender it at build time and serve it as a static asset.
export const dynamic = 'force-static';

export function GET(): Response {
    return new Response(buildLlmsTxt(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
