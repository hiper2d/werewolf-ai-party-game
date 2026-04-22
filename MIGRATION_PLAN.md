# UI Migration Plan — Werewolf Chat Game

A phased plan to migrate an existing Next.js app to the **AI WEREWOLF brutalist mono** design system, using Claude Code for code changes and Claude Design (me) for design decisions and handoff docs.

---

## Phase 0 — Prep (30 min)

- [ ] Create a long-lived branch: `design/brutalist-v2`
- [ ] Take full-page screenshots of every current route (for before/after diffs)
- [ ] Note current styling stack (Tailwind? shadcn/ui? CSS Modules?) — this shapes every later step
- [ ] Add `/design-system-v1/` folder and move current tokens/primitives into it so nothing is lost
- [ ] Add a feature flag `NEXT_PUBLIC_DESIGN=v1|v2` so both systems can coexist during migration

**Exit criteria:** clean branch, screenshots saved, old system quarantined.

---

## Phase 1 — Extract the spec (Claude Code, 1 session)

Have Claude Code produce three reference docs. Prompt in the next section.

Artifacts:
- `docs/SPEC_ROUTES.md` — every route, data, actions
- `docs/SPEC_COMPONENTS.md` — every shared component, props, usage
- `docs/SPEC_TOKENS.md` — current colors, fonts, spacing, radii

**Exit criteria:** you can read these three docs and understand the app without opening source files.

---

## Phase 2 — Design agreement (Claude Design, 2-3 sessions)

Per-page, not all at once.

**Session A — system + flagships**
- Agree on: tokens, typography, primitives (Button/Card/Input/Badge/Tabs), nav pattern
- Design 2 flagship pages end-to-end (typically landing + primary feature)
- Output: updated prototype HTML with the flagship pages

**Session B — remaining pages in batches of 3-4**
- Apply the system to each page
- Flag any page that doesn't fit the system (usually a sign it needs a new pattern)

**Session C — edge cases**
- Empty states, loading states, error states, modals, toasts
- These are usually under-designed but break brutalist systems fast

**Exit criteria:** every route in `SPEC_ROUTES.md` has a matching design, and we have a `COMPONENT_MAP.md` showing old → new for every primitive.

---

## Phase 3 — Asset handoff (Claude Design, 1 session)

I produce a `/design-system-v2/` folder:

```
design-system-v2/
├── tokens.css               CSS variables (colors, borders, spacing)
├── fonts.ts                 next/font config
├── primitives/              Button.tsx, Card.tsx, Input.tsx, Badge.tsx, Tabs.tsx
├── patterns/                CampfireChat.tsx, StatGrid.tsx, VoteList.tsx
├── icons.tsx                Line-art SVG set
├── COMPONENT_MAP.md         Old prop → new prop mapping table
└── MIGRATION.md             The playbook for Claude Code
```

**Exit criteria:** the folder drops into the repo cleanly and nothing outside it has been touched yet.

---

## Phase 4 — Dry run on one page (Claude Design, 30 min)

Pick the most representative page. I produce a standalone HTML of what it should look like post-migration. Compare against the live page. Catch system gaps before Claude Code touches real code.

**Exit criteria:** no open questions about how any primitive or pattern should behave.

---

## Phase 5 — Foundation migration (Claude Code, 1 PR)

Task: install the foundation. No visual changes yet.

- Wire up `tokens.css` in `globals.css`
- Wire up `next/font` for JetBrains Mono
- Add `design-system-v2` to Tailwind config (if using)
- Add feature flag reader

**Do NOT migrate any components or pages in this PR.**

**Exit criteria:** app still looks identical to before, but the new foundation is loaded and reachable.

---

## Phase 6 — Primitive migration (Claude Code, 1 PR)

Rewrite shared primitives (`Button`, `Card`, `Input`, `Badge`, `Tabs`, `Nav`) to match v2. Every page that uses them updates automatically.

**Exit criteria:** app visually matches v2 at the primitive level. Layouts may still be off — that's next phase.

---

## Phase 7 — Page migration (Claude Code, 1 PR per batch of 3-4 pages)

Order:
1. Landing / marketing
2. Auth + profile
3. List views (games dashboard, browse)
4. Interactive views (chat, lobby, vote) — chat is its own PR

Per page: Claude Code references `patterns/`, the design HTML, and `COMPONENT_MAP.md`. **Markup and classes only** — no logic changes.

**Exit criteria per PR:** before/after screenshot review passes, no behavior regressions.

---

## Phase 8 — Campfire chat port (Claude Code, 1 PR)

Special case because of the animation system.

- Copy seat geometry, ember animation, spark loop as-is from the prototype
- Replace `setInterval` fake chatter with the real websocket/realtime subscription
- Keep local state (`floating`, `sparks`, `speakingId`) local
- Only `messages` comes from the backend

**Exit criteria:** real messages rise as embers from the right seat.

---

## Phase 9 — Sweep + retire v1 (Claude Code, 1 PR)

- Remove `/design-system-v1/`
- Remove feature flag
- Delete dead styles
- Update Storybook / component gallery if you have one

**Exit criteria:** grep for old token names returns zero matches.

---

## Phase 10 — Visual regression review (you + me)

Walk every route with the before/after screenshots from Phase 0. Flag anything that drifted. Back to Claude Code for tiny fixes.

---

# Claude Code Instruction — Spec Extraction

Paste this verbatim into Claude Code to produce Phase 1 deliverables.

---

## Task: Produce a design-migration spec for this Next.js app

You are NOT making any changes. You are producing three reference documents that a designer will use to plan a full UI migration. Be thorough, concrete, and cite file paths.

### Rules of engagement

- **Read-only.** Do not modify any source files.
- **Cite sources.** Every claim gets a file path, ideally with line numbers.
- **Don't guess.** If you can't determine something from the code, say "unknown — needs confirmation" and list what you'd need to see.
- **No opinions.** Describe what exists, not what should change.

### Deliverables

Create three files under `docs/`:

#### 1. `docs/SPEC_ROUTES.md`

For every route in the app (App Router `page.tsx` files and any Pages Router `pages/*`), document:

```
## Route: /games/[id]/chat
**File:** app/games/[id]/chat/page.tsx
**Rendering:** client | server | static
**Auth:** required | public
**Data fetched:**
  - `game` from `getGame(id)` — fields: id, phase, day, players[]
  - `messages` from realtime subscription `messages:game_id=eq.{id}`
**Mutations / actions:**
  - `sendMessage(text)` → POST /api/messages
  - `castVote(targetId)` → server action in @/app/actions/vote.ts
**UI sections on this page:**
  - Header: phase indicator, timer
  - Main: message list, input
  - Sidebar: player roster
**Query params / state:**
  - `?spectate=1` toggles spectator mode
**Navigation edges:**
  - Entered from: /games (dashboard), /games/[id]/lobby
  - Exits to: /games/[id]/vote, /games/[id]/recap
```

Group routes by area (marketing / auth / games / profile / admin).

#### 2. `docs/SPEC_COMPONENTS.md`

For every shared component (anything imported in 2+ places, plus every file under `components/`), document:

```
## Button
**File:** components/ui/button.tsx
**Props:** { variant: 'primary'|'ghost'|'destructive', size: 'sm'|'md'|'lg', loading?: boolean, children }
**Built on:** Radix Slot, cva
**Used in:** 47 places (list top 10 with file paths)
**Variants in the wild:** primary is most common; destructive only in /settings/delete-account
**Visual notes:** rounded-md, border, uses --primary and --destructive tokens
```

Also list, at the end, a **"Uncategorized markup"** section for any one-off UI that isn't componentized but probably should be (repeated card patterns, inline badge-like spans, etc.).

#### 3. `docs/SPEC_TOKENS.md`

Document the current design system:

- **Color tokens** — every CSS variable, Tailwind color, or theme constant. Include hex / hsl values and where each is used.
- **Typography** — font families, weights, sizes, line heights. Cite the source (next/font, @font-face, Tailwind config).
- **Spacing** — spacing scale if there is one, plus any magic numbers that recur.
- **Radii** — border-radius values in use.
- **Shadows** — all box-shadow styles.
- **Motion** — any transition/animation tokens.
- **Icons** — which icon library (Lucide, Heroicons, custom?), typical stroke/weight settings.
- **Styling stack** — Tailwind version, shadcn/ui (list components installed), CSS Modules, anything else.

### Process

1. Start with `find . -name "page.tsx" -o -name "layout.tsx"` (or equivalent) to enumerate routes.
2. Read `package.json`, `tailwind.config.*`, `globals.css`, `app/layout.tsx` to establish the styling stack.
3. For each route, open the page file and trace its imports one level deep.
4. For each component, grep for its import path to count usages.
5. Write the three docs.

### Output

When done, print a one-page summary listing:
- Route count
- Component count
- Styling stack in one line
- Top 5 components by usage
- Any ambiguities flagged for the designer
- Paths to the three new docs

Do not proceed to any migration work. Wait for the designer's next instructions.

---

Once Claude Code produces these three docs, hand them to me and we'll start Phase 2.

