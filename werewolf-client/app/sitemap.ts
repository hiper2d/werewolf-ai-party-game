import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/config/external-links';
import { PUBLIC_PAGES } from '@/app/seo/public-pages';

// Served at /sitemap.xml. Static list; the public page set changes rarely and
// lastModified = build time is honest enough for a site that redeploys often.
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return PUBLIC_PAGES.map(p => ({
        url: p.path === '/' ? SITE_URL : `${SITE_URL}${p.path}`,
        lastModified,
        changeFrequency: p.changeFrequency,
        priority: p.priority,
    }));
}
