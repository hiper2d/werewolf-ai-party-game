---
name: verify
description: How to run and drive the Werewolf client app to verify UI changes end-to-end in a real browser.
---

# Verify — run and drive the Werewolf client

## Launch

The user usually has `npm run dev` already running on **localhost:3000** — check with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` before starting your own.
A second `next dev` fails on the `.next/dev/lock` file, so reuse the running server
(Next dev hot-reloads your edits from disk).

If nothing is running: `cd werewolf-client && npm run dev` (needs sandbox disabled — it binds a port).

## Drive

Use the `agent-browser` CLI (install: `npm i -g --allow-scripts=agent-browser agent-browser && agent-browser install`).
Core loop: `agent-browser open <url>` → `snapshot -i` → `click @eN` → re-snapshot. Also useful:
`eval "<js>"` (localStorage, DOM checks), `press Escape`, `screenshot <path>`, `reload`.
Run its commands with sandbox disabled (it talks to Chrome over a socket).

Gotchas:
- React effects run after page load — `wait --load networkidle` (or re-eval) before asserting
  localStorage/DOM state, or you'll read pre-hydration values.
- After `dispatchEvent`-style synthetic clicks, the DOM check in the same `eval` runs before
  React re-renders — sleep ~1s and re-check.
- `/games` and other authed routes redirect unauthenticated sessions to `/`.

## Flows worth driving

- Home `/`, `/news`, `/rules`, `/models` render without auth.
- Theme: toggle via `document.documentElement.setAttribute('data-theme','light')` +
  `localStorage.setItem('theme','light')`; check both themes for UI changes.
- What's New popup: gated by localStorage key `newsLastSeenId` vs `CHANGELOG[0].id`
  (`app/news/changelog.tsx`). Set it to an older id (e.g. `sonnet-5`) and reload to force it open;
  delete it to simulate first visit (seeds silently, no popup); it never shows on `/news`.
