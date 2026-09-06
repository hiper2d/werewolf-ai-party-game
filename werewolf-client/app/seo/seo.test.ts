import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { PUBLIC_PAGES, PRIVATE_PREFIXES } from '@/app/seo/public-pages';
import { SITE_URL } from '@/app/config/external-links';

describe('robots.txt', () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;

    it('advertises the sitemap as an absolute URL on the canonical host', () => {
        expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    });

    it('blocks the login-only areas and nothing public', () => {
        const disallow = ([] as string[]).concat(rule.disallow ?? []);
        for (const prefix of PRIVATE_PREFIXES) expect(disallow).toContain(prefix);
        for (const p of PUBLIC_PAGES) {
            expect(disallow.some(d => p.path.startsWith(d))).toBe(false);
        }
    });
});

describe('sitemap.xml', () => {
    const entries = sitemap();

    it('lists every public page exactly once, on the canonical host', () => {
        expect(entries).toHaveLength(PUBLIC_PAGES.length);
        const urls = entries.map(e => e.url);
        expect(new Set(urls).size).toBe(urls.length);
        for (const url of urls) expect(url.startsWith(SITE_URL)).toBe(true);
        expect(urls).toContain(SITE_URL);
        expect(urls).toContain(`${SITE_URL}/rules`);
    });

    it('never lists a private page', () => {
        for (const e of entries) {
            const path = e.url.slice(SITE_URL.length) || '/';
            expect(PRIVATE_PREFIXES.some(d => path.startsWith(d))).toBe(false);
        }
    });

    it('has no trailing slashes (matches how Next serves the routes)', () => {
        for (const e of entries) expect(e.url).not.toMatch(/.\/$/);
    });
});
