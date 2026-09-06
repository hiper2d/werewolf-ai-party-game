import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/config/external-links';
import { PRIVATE_PREFIXES } from '@/app/seo/public-pages';

// Served at /robots.txt. Static: the rule set only changes on deploy.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: PRIVATE_PREFIXES,
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
