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
- **llm-agents crypto**: grok/mistral agents use `stableHashHex` (text-utils)
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
- Known render warns: none currently (15/15 clean, 0 flagged).

## Re-sync risks

- `design-kit/static/` is generated: stale if the app's Tailwind classes/tokens
  changed since the last `npm run build` — always re-run buildCmd first.
- The `inputStyle` string in ExpandableTextarea's preview and the option shapes
  in ModelSelectDropdown/AIModelSelect previews are copies of app code and can
  silently drift.
- `dtsPropsFor` bodies are manual transcriptions of the source interfaces —
  re-verify against the sources on any component API change.
- Chrome at the hardcoded /Applications path — breaks if Chrome moves/uninstalls.
