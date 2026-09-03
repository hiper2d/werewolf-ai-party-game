# design-sync notes — Werewolf AI UI Kit

- **Not a library repo**: werewolf-client is a Next.js app. The kit entry is the
  hand-curated `werewolf-client/design-kit/index.ts` (browser-safe components
  only) — pass it as `--entry`. Never synth-entry from `app/` (it would pull
  server actions / firebase-admin).
- **CSS comes from the Next production build**: `buildCmd` runs `npm run build`
  then `design-kit/refresh-css.mjs`, which copies the largest compiled chunk to
  `design-kit/static/chunks/styles.css` + the woff2s to `static/media/`
  (preserving the `../media` relative layout so font extraction resolves).
  `design-kit/static/` is gitignored — a fresh clone must run buildCmd first.
- **Render check browser**: no playwright chromium cache on this machine — use
  `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
  for validate AND capture (playwright + playwright-core are installed in
  `.ds-sync/`, no browser download).
- **Components must stay browser-safe**: CharacterCard takes its server actions
  as props (`onRegenerate`/`onSelectVariant` — GamePage injects them) and both
  cards take image-override props (`avatarUrl` / `imageSrc`). Don't reintroduce
  direct server-action imports into anything exported by design-kit/index.ts.
- **ai-agents crypto**: grok/mistral agents use `stableHashHex` (text-utils)
  instead of node `crypto` — required for the browser bundle to resolve. Keep it
  that way for any new agent.
- **source-kit fork** (`.design-sync/overrides/source-kit.mjs`): filters Next.js
  `[param]` route segments out of group derivation. Needs the fork symlink on a
  fresh clone: `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`.
- **leadingJsdoc misses `export default function`** (converter heuristic), so
  `@category` JSDoc tags only work for const-arrow exports (the icons). All
  other grouping goes through `docsMap` → `.design-sync/docs/*.md` (frontmatter
  `category`). The cards' docs use `category: Games` on purpose — it must match
  the path-derived group name (`app/games/...`) or the two would diverge.
- **dtsPropsFor is hand-written for all 15 components** (no shipped .d.ts to
  extract from). When a component's props change in the app, update the matching
  entry in config.json — nothing will catch the drift automatically.
- **Fixed-overlay modals in previews**: the harness cell has a CSS transform, so
  `fixed inset-0` resolves against it (height 0 → card clipped). Previews wrap
  modals in a sized `transform: scale(1)` frame; the conventions header teaches
  designs the same trick.
- **ExpandableTextarea ships unstyled by design** — the app passes its themed
  input classes via `className` (newgame `inputStyle`); the preview replicates
  that string. If the app's inputStyle changes, refresh the preview copy.
- **process shim** (`design-kit/process-shim.ts`, first import in index.ts):
  `@hiper2d/ai-agents@0.1.0` reads `process.env.LOG_*` at module scope
  (`DEFAULT_LOGGING_CONFIG` in dist/index.mjs) — fine under Next (DefinePlugin),
  fatal in the plain-browser design bundle (`ReferenceError: process is not
  defined` → every card empty). The shim defines `globalThis.process = {env:{}}`
  before anything else. The real fix (lazy/guarded env reads) belongs in the
  LIBRARY repo (~/projects/ai-agents) — worth landing before the v0.1.0 tag.
- **IllustrationsPanel** (newgame group): like the cards, it got a design-only
  image-override prop — `imageUrlFn?: (key) => string` (the app never passes it;
  scene image asks for key `scene-welcome`). If the app's draft-image route
  changes shape, only the in-app default path needs touching.
- Known render warns: none currently (17/17 clean, 0 flagged). Build-log
  informational lines that are expected every run: `[DOCS_UNMAPPED]` for the 7
  icons (they group via `@category` JSDoc, no docs on purpose).
- **Sandboxed Claude Code sessions**: the validate stage's render check and
  `storybook/http-serve.mjs` both `listen` on 127.0.0.1, which the Bash sandbox
  denies (`listen EPERM`). Run the driver / serve with the sandbox disabled for
  that one command (static checks pass either way; only the render check needs it).

## Re-sync risks

- `design-kit/static/` is generated: stale if the app's Tailwind classes/tokens
  changed since the last `npm run build` — always re-run buildCmd first.
- The `inputStyle` string in ExpandableTextarea's preview and the option shapes
  in ModelSelectDropdown/AIModelSelect previews are copies of app code and can
  silently drift.
- `dtsPropsFor` bodies are manual transcriptions of the source interfaces —
  re-verify against the sources on any component API change.
- Chrome at the hardcoded /Applications path — breaks if Chrome moves/uninstalls.

## 2026-08-30 — CharacterCard changed, re-sync done same day

(Everything below was picked up by the 2026-08-30 re-sync: full package-build ran,
CharacterCard re-graded, CharacterPoster + IllustrationsPanel added — 17
components. ExpandableTextarea moved to `cardMode: column` after a
`[GRID_OVERFLOW]` flag on Collapsed/Empty.)

- The card's reroll button (`onRegenerate`, "Drawing new portraits…" overlay) was removed; portrait redraw now lives in the game page's participants header. The switcher is chevrons + dots (numeric counter past six candidates).
- Updated locally: `.design-sync/previews/CharacterCard.tsx` (stories: Owner, ManyCandidates, DeadWerewolf, ReadOnly — the Regenerating story is gone), `.design-sync/docs/CharacterCard.md`, `dtsPropsFor.CharacterCard` in config.json.
- Component code changed → the next `/design-sync` needs a full package-build (preview-rebuild alone keeps the old bundle). Until then the kit's CharacterCard still shows the reroll button.
- New app-only pieces not in the kit: `app/games/newgame/components/IllustrationsPanel.tsx` (paid-tier preview block). Consider adding it to `werewolf-client/design-kit/index.ts` on the next sync.
- 2026-08-30 (later): the two character cards were unified. New `CharacterPoster` (cinematic look: 3:4.35 portrait, role chip, glow ring, name plate, STORY toggle) is exported from the kit entry with its own preview/doc/config entries; `CharacterCard` is now a modal around it (switcher lives in the poster's top-right chip). Both need the next full package-build to reach the kit.

## 2026-09-02 — re-sync (config-only drift)

- App changes since 2026-08-30 touching kit components: `CharacterCard` switched to a
  mannequin-first candidate cycle (`MANNEQUIN_VARIANT_INDEX`, `getAvatarVariantState().hasCandidates`)
  — no prop change, the authored preview's `avatarVariants: {n, sel}` still drives the
  switcher (now "1 of 4": mannequin + 3); `IllustrationsPanel` gained
  `onPortraitClick?: (entry: CastEntry) => void` — added to `dtsPropsFor.IllustrationsPanel`
  (the drift `dtsPropsFor` can't detect on its own; found by `git log` on the kit sources).
- Driver verdict: 17 verified-by-upload, 0 to grade, render check 17/17 clean; upload =
  IllustrationsPanel `.d.ts` + bundle + styling, 0 deletes.
- `.design-sync/overrides/source-kit.mjs` vs the 2.1.258 upstream: only the `[param]` filter
  line and the `../../.ds-sync/lib/` import paths differ — nothing to merge.

