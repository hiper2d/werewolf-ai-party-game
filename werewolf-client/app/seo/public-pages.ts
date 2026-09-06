// The public, crawlable page set. Everything else (/games, /profile, /api) is
// behind login and stays out of robots and the sitemap.
export interface PublicPage {
    path: string;
    priority: number;
    changeFrequency: 'weekly' | 'monthly' | 'yearly';
}

export const PUBLIC_PAGES: PublicPage[] = [
    { path: '/',        priority: 1.0, changeFrequency: 'weekly' },
    { path: '/rules',   priority: 0.8, changeFrequency: 'monthly' },
    { path: '/models',  priority: 0.8, changeFrequency: 'weekly' },
    { path: '/news',    priority: 0.7, changeFrequency: 'weekly' },
    { path: '/about',   priority: 0.5, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/terms',   priority: 0.2, changeFrequency: 'yearly' },
];

export const PRIVATE_PREFIXES = ['/games', '/profile', '/api/'];
