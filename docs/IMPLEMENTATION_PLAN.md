# Implementation Plan — Ember Design System Migration

## Overview

Migrate the Werewolf AI Party Game UI from the current clean/corporate look to the **Ember** campfire pixel-art design system. Claude Design has produced a complete prototype in `docs/redesign/`. Claude Code should reference these files as visual and code examples, adapting them to the real Next.js/Tailwind codebase.

## Reference Files

All design assets live in `docs/redesign/`:

| File | What It Contains | How to Use It |
|------|-----------------|---------------|
| `styles.css` | Complete Ember CSS: tokens, sprites, campfire scene, chat, modals, buttons, responsive breakpoints | **Primary reference.** Extract CSS variables, class definitions, and responsive rules. Port to `globals.css` + Tailwind config |
| `components.jsx` | React components: NavBar, PhaseBar, Campfire scene, Chat messages, Queue panel | **Code reference.** Shows structure, props, and JSX for each component. Adapt to real props/data from the existing codebase |
| `sprites.jsx` | Procedural pixel-art character sprite system (SVG-based, 16×20px grid) with 12 archetypes, 5 skin tones, 7 hat types | **Copy and adapt.** This is production-ready SVG rendering code. Integrate as a React component |
| `modals.jsx` | Modal shell, VotingModal, NightActionModal, LoginModal, TweaksPanel | **Code reference.** Adapt to real modal props from `GAME_SCREEN_SPEC.md` |
| `tokens.jsx` | Design token viewer (palette, typography, sprites) | **Reference only.** Use the hex values and font configs listed here |
| `data.jsx` | Sample player data, messages, queue fixtures | **Reference only.** Shows expected data shapes |
| `pages/lobby.jsx` | Game creation/lobby page with cast selection, role distribution, seat preview | **Code reference.** Adapt to the real `/games/newgame` form |
| `pages/role-reveal.jsx` | Role reveal animation page (sealed card → flip → role details) | **New feature.** This doesn't exist in the current app — implement if desired |
| `pages/_shared.jsx` | Shared page shell (NavBar + flow navigation) | **Code reference.** Adapt for layout |
| `screenshots/lobby-preview.jpg` | Screenshot of the lobby design | **Visual reference** |

## Spec Files (ground truth for controls)

The design prototype invented some controls and omitted others. **Always defer to these specs** for what controls must exist:

- `docs/GAME_SCREEN_SPEC.md` — every control on `/games/[id]`
- `docs/ALL_SCREENS_SPEC.md` — every control on all other screens
- `docs/SPEC_ROUTES.md` — route structure
- `docs/SPEC_COMPONENTS.md` — component inventory
- `docs/SPEC_TOKENS.md` — current token inventory (for mapping old → new)

## Design System Tokens (from `styles.css`)

### Color Palette
```
Base:     --bg-0: #0a0a14  --bg-1: #12121e  --bg-2: #1a1a2a  --bg-3: #232338  --bg-4: #2d2d46
Borders:  --border: #3a3a58  --border-strong: #4a4a70
Fire:     --fire-0: #2a0a05  --fire-1: #7a1f0a  --fire-2: #c4421a  --fire-3: #f07a22  --fire-4: #ffb347  --fire-5: #ffe58a
Moon:     --moon-0: #1a2840  --moon-1: #4a6a9a  --moon-2: #8ab4e8  --moon-3: #c7dcf5
Blood:    --blood-1: #4a0f18  --blood-2: #a01830  --blood-3: #e23e52
Teams:    --team-village: #5ec76a  --team-wolf: #e23e52
Text:     --ink-0: #f5f0e0  --ink-1: #d8d0bc  --ink-2: #9a94a8  --ink-3: #6a6480
```

### 16 Player Colors
```
P00: #f07a22  P01: #ffb347  P02: #8ab4e8  P03: #c7dcf5
P04: #5ec76a  P05: #a3e635  P06: #e23e52  P07: #ec4899
P08: #a78bfa  P09: #22d3ee  P10: #f5dc6f  P11: #14b8a6
P12: #d4a574  P13: #b45309  P14: #dbb4ff  P15: #96c8a2
GM:  #ffe58a
```

### Typography
- **Pixel (UI chrome, headings):** `'Press Start 2P', monospace` — 8-14px, uppercase, letter-spacing 1-2
- **Console (HUD, labels, meta):** `'VT323', monospace` — 13-16px, numeric data
- **Body (chat, readable text):** `'Inter', system-ui, sans-serif` — 15px, weights 400/500/600

### Buttons
- `.pbtn` — base pixel button (bg-3, border, 3px box-shadow depth, uppercase pixel font)
- `.pbtn-primary` — fire gradient (fire-3 → fire-2), dark text
- `.pbtn-danger` — blood gradient (blood-3 → blood-2), white text
- `.pbtn-ghost` — transparent, border only
- `.pbtn-sm` — compact variant

### Panels
- `.panel` — thick double-border with shadow (signature chrome)
- `.panel-sm` — simpler single border

---

## Migration Steps

### Step 1: Foundation (1 PR)

**Goal:** Install the Ember design system without changing any page visuals yet.

1. Add Google Fonts: Press Start 2P, VT323 (alongside existing Inter)
2. Port CSS variables from `styles.css` into `globals.css` (new section, don't remove v1 vars yet)
3. Add Ember colors to `tailwind.config.ts` (map to CSS vars)
4. Add new font families to Tailwind config
5. Add `.panel`, `.pbtn`, `.pixel-text`, `.console-text` utility classes to globals.css
6. Copy `sprites.jsx` → `components/sprites/CharacterSprite.tsx` (convert to TypeScript)
7. Copy `sprites.jsx` → `components/sprites/CampfireSprite.tsx`
8. Add `getColor()` helper from `components.jsx` → `utils/ember-colors.ts`

**Do NOT change any existing components yet.**

### Step 2: Campfire Scene Component (1 PR)

**Goal:** Build the Campfire scene as a standalone component.

Reference: `components.jsx` → `Campfire` function (lines 97-448)

1. Create `components/game/CampfireScene.tsx`
   - Accept props: `players`, `phase`, `speakingId`, `deadIds`, `votes`, `queue`, etc.
   - Render the fire, stars, moon/sun, treeline, ground, logs, character sprites in elliptical layout
   - Implement drag-to-rotate (pointer events)
   - Auto-rotate to speaking character
   - Character states: idle, speaking (glow + bob), dead (greyscale + ghost)
   - Hover card on desktop, bottom sheet on mobile
   - Responsive: full scene on desktop, compact strip on mobile
2. Create `components/game/PhaseBar.tsx` — top bar with day counter, phase pill, action buttons

### Step 3: Game Page Migration (1-2 PRs)

**Goal:** Replace the current 3-panel game layout with campfire + chat.

Reference: `GAME_SCREEN_SPEC.md` for controls, `components.jsx` for visual style

1. Replace left panel (participant roster) with CampfireScene
2. Restyle chat panel to match Ember chat design:
   - `.chat-msg` grid layout (avatar | content | meta)
   - Player-colored avatars with initials
   - GM messages with fire-tinted left border
   - System messages centered with diamond dividers
   - Message cost badges in console font
3. Restyle input area:
   - `.chat-input-wrap` and `.chat-input` styles
   - Action buttons as `.pbtn` variants
   - Keep all existing controls from spec (Send, Vote, Go on, Start Night, etc.)
4. Integrate status/queue panel into the new layout:
   - Queue items with `.queue-item` styling
   - Progress bar with fire gradient fill
   - Keep "Select Bots Manually" button
5. Restyle all game modals (VotingModal, NightActionModal, etc.):
   - Use `Modal` shell from `modals.jsx`
   - VotingModal: grid of character sprites to click
   - NightActionModal: player grid with role-specific accent colors
   - Keep all spec controls (reason textarea, action type radios, etc.)
6. Mobile: edge drawer toggles, compact campfire strip, queue drawer

### Step 4: Navbar + Login Dialog (1 PR)

**Goal:** Replace navbar and login with Ember style.

Reference: `components.jsx` → `NavBar`, `modals.jsx` → `LoginModal`

1. Restyle NavBar:
   - Pixel art logo (fire icon from prototype or existing logo)
   - "WEREWOLF.AI" in pixel text
   - Nav links in pixel-text uppercase
   - User name + tier badge
   - Mobile hamburger
2. Restyle LoginDialog:
   - "ENTER THE CIRCLE" modal
   - Campfire sprite in center
   - GitHub/Google buttons as `.pbtn`

### Step 5: Home Page (1 PR)

**Goal:** Redesign landing page with Ember aesthetic.

1. Hero with campfire scene or pixel art fire
2. Title in pixel font with fire glow text-shadow
3. Feature cards as `.panel-sm` with pixel-text headings
4. CTA buttons as `.pbtn-primary`
5. Dark atmospheric background

### Step 6: Game Creation Page (1 PR)

**Goal:** Restyle `/games/newgame` with Ember look.

Reference: `pages/lobby.jsx` for visual inspiration, `ALL_SCREENS_SPEC.md` for exact controls

1. Apply Ember input/select styles (`.chat-input` adapted for forms)
2. Cast list with character sprites (if we add sprite preview to bot cards)
3. Role checkboxes restyled
4. Preview section with per-bot cards in `.panel-sm`
5. All buttons as `.pbtn` variants
6. **Keep all existing form controls** — don't drop any inputs listed in the spec

### Step 7: Remaining Pages (1 PR)

1. `/games` — game list with `.panel-sm` cards, pixel-text headings
2. `/profile` — tier tabs, API key management, pricing table, all in Ember style
3. `/rules` — role cards with team badges (`.team-badge`), section panels
4. `/about` — content with Ember typography
5. `/privacy`, `/terms` — minimal restyling, dark background with Ember text colors

### Step 8: Cleanup (1 PR)

1. Remove v1 CSS variables from globals.css
2. Remove v1 design-system folder
3. Remove old button constant strings (`buttonTransparentStyle`, `buttonBlackStyle`)
4. Remove unused theme-* CSS classes
5. Verify no old token names remain (`grep`)

---

## Key Principles

1. **Spec > Prototype.** If the Ember prototype has a control not in the spec, don't add it. If the spec has a control not in the prototype, add it with Ember styling.

2. **Style only, no logic changes.** Game logic, state management, API calls — all stay exactly the same. We're changing CSS/JSX markup, not behavior.

3. **One PR per step.** Each step should result in a working app. Don't break things between steps.

4. **Dark-first.** The Ember design is dark-only for now. Light theme can be added later. Remove the theme toggle if desired, or keep it non-functional.

5. **Sprite system is production-ready.** The `sprites.jsx` code generates pixel-art characters as inline SVGs — no external assets needed. Copy it.

6. **Chat readability is sacred.** The Inter font at 15px for chat body text must not be compromised. Pixel fonts are for UI chrome only.

---

## Controls Mapping: Prototype → Spec

Things the **prototype invented** (not in spec, don't implement):
- "WHISPER" button in chat input
- "PAUSE", "SKIP SPEAKER", "REROLL" buttons in queue panel
- "Turn time", "Voting window", "Host narrates" game settings
- Flow navigation bar (01 Lobby → 02 Reveal → 03 Day → etc.)

Things the **prototype omitted** (in spec, must implement):
- Voice/TTS controls (mic button, speaker button per message, AI suggestion)
- Day selector dropdown in chat header
- Message delete/reset buttons (X with dropdown)
- Vote urgency states (warning yellow, urgent red+pulse)
- Cancel button (appears after 10s of processing)
- Expand/shrink textarea button
- @mention autocomplete dropdown
- All night action role variants (Doctor heal/kill, Detective investigate/kill, Maniac abduct)
- BotSelectionDialog with ordered selection
- ModelSelectionDialog with tier-aware model list
- Per-bot cost display ($0.0234)
- Game description text
- Total game cost display
- Error banners with retry
- "Replay Night" and "Next Day" buttons
- Free tier reset limits on message deletion
