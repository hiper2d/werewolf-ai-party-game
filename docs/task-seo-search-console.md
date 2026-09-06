# Task: SEO baseline - robots.txt, sitemap, Search Console

Status: code side implemented 2026-09-06 on `develop` (`app/robots.ts`, `app/sitemap.ts`,
`app/seo/public-pages.ts` + test, canonical/title metadata on all 7 public pages). Steps 1-4
below are done; step 5 (Search Console clicks after deploy) is still on Alex.

## Current state (checked 2026-09-06 against production)

Already in place:
- `google-site-verification` TXT record exists on `aiwerewolf.net` in Cloudflare, so the domain
  was verified in Search Console at some point. Confirm the Domain property is still listed under
  the account.
- Root `app/layout.tsx` sets `metadataBase`, title, description, OG and Twitter cards, and
  JSON-LD (Organization + WebSite). `/rules`, `/models`, `/news` have their own `metadata`.
- Home, rules, models, news, about are server-rendered (real HTML for the crawler, not a
  client-only shell).
- `www.aiwerewolf.net` -> `aiwerewolf.net` redirect works (307). Fine for Google; 308 would be
  marginally cleaner but not worth touching.

Missing:
- `https://aiwerewolf.net/robots.txt` returns the Next 404 page.
- `https://aiwerewolf.net/sitemap.xml` returns the Next 404 page.
- No `canonical` on any page. Cheap to add via `alternates.canonical` in the metadata.
- `/about`, `/privacy`, `/terms` inherit the root title "Werewolf AI" with no per-page title.

Without a sitemap there is nothing to submit in Search Console, and Google discovers the public
pages only by following links from home. Fixing this is two files plus a few metadata lines.

## Work

### 1. `app/robots.ts`

Next generates `/robots.txt` from this file.

```ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/config/external-links';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/games', '/games/', '/profile', '/api/'],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
```

`/games` and `/profile` are behind login; indexing them just produces "login required" junk in
the results. `/api/` for the same reason.

### 2. `app/sitemap.ts`

Next generates `/sitemap.xml` from this file. Static list is enough; the public page set changes
rarely.

```ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/config/external-links';

export default function sitemap(): MetadataRoute.Sitemap {
    const pages = [
        { path: '',         priority: 1.0, changeFrequency: 'weekly'  as const },
        { path: '/rules',   priority: 0.8, changeFrequency: 'monthly' as const },
        { path: '/models',  priority: 0.8, changeFrequency: 'weekly'  as const },
        { path: '/news',    priority: 0.7, changeFrequency: 'weekly'  as const },
        { path: '/about',   priority: 0.5, changeFrequency: 'yearly'  as const },
        { path: '/privacy', priority: 0.2, changeFrequency: 'yearly'  as const },
        { path: '/terms',   priority: 0.2, changeFrequency: 'yearly'  as const },
    ];
    return pages.map(p => ({
        url: `${SITE_URL}${p.path}`,
        lastModified: new Date(),
        changeFrequency: p.changeFrequency,
        priority: p.priority,
    }));
}
```

Optional refinement: derive `lastModified` for `/news` from the newest entry in
`app/news/changelog.tsx` instead of build time. Not needed for the first pass.

### 3. Canonical + missing titles

In `app/layout.tsx` metadata add:

```ts
alternates: { canonical: '/' },
```

Next resolves it against `metadataBase` per route only when set on that route, so add
`alternates: { canonical: '/rules' }` (etc.) to the three pages that already export `metadata`,
and give `/about`, `/privacy`, `/terms` a `metadata` export with title + description + canonical.
Same pattern as `app/rules/page.tsx`.

### 4. Verify locally

```
cd werewolf-client && npm run dev
curl -s localhost:3000/robots.txt
curl -s localhost:3000/sitemap.xml
```

robots must list the sitemap URL; sitemap must list exactly the seven public URLs with
`https://aiwerewolf.net` as the host (not localhost - that's what `SITE_URL` is for).

### 5. Deploy, then Search Console (manual, Alex)

1. https://search.google.com/search-console -> confirm the `aiwerewolf.net` Domain property is
   there. If not, re-add it; the TXT in Cloudflare is already in place so verification is
   instant.
2. Indexing -> Sitemaps -> submit `https://aiwerewolf.net/sitemap.xml`.
3. URL Inspection -> Request indexing on `/`, `/rules`, `/models`. Skips the discovery wait.
4. Search `site:aiwerewolf.net` and `site:<vercel-alias>.vercel.app`. The Vercel project is
   called `ai-werewolf` but `ai-werewolf.vercel.app` belongs to somebody else's Svelte demo, so
   the real production alias has a team suffix; read it off the Vercel dashboard. If that alias
   is indexable and Google has picked it up, add a permanent redirect to `aiwerewolf.net` in
   `next.config.js` (`redirects()` with a `has: [{ type: 'host', value: '<alias>.vercel.app' }]`
   matcher) and the stale entries fall out on their own.

## Not in scope

- Content-side SEO (per-model pages, "play werewolf with GPT/Claude/Gemini" landing pages).
  The technical baseline above only makes the seven existing pages crawlable. Ranking for
  anything beyond the brand name needs pages that actually say something. Separate task.
- Bing Webmaster Tools. Can import from Search Console in one click once the above is done.
