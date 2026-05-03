# Handoff: Create New Game — page redesign

## Overview
Redesign of the **Create New Game** page in the Werewolf app, plus the **Generating Game Preview** notification and the **Generated Game Preview** section that appears below it.

Key fixes vs. the previous design:
1. **Special Roles** are now toggle chips (all visible, click to toggle) instead of awkward selected-pills.
2. **"Fast only"** is no longer a stranded checkbox — it's a filter pill *inside* the AI multi-select dropdown.
3. **Purple removed** from the palette. Replaced with a neutral cool-grey scale + a single restrained blue accent.
4. **Light theme** added. Selected chip text uses `--accent-fg` so labels stay legible against soft accent fills in both modes.
5. **Generating banner** redesigned as a proper info banner (subtle accent-tinted fill, spinning icon, animated dots, secondary description text).
6. **Game Preview** section laid out as a clear hierarchy: Game Story → Game Master card → Players cards.

## About the Design Files
The files in this bundle (`Create Game.html`, `app.jsx`, `components.jsx`, `tweaks-panel.jsx`) are **design references created in HTML** — a working prototype showing intended look and behavior. They are not meant to be dropped into production. The task is to **recreate this design in the existing Werewolf codebase**, using its established framework, component library, and styling conventions. If the codebase is React, port the components directly; otherwise translate the structure and styling but preserve the visual specifications below.

To run the prototype: open `Create Game.html` in any browser. No build step. URL params:
- `?state=generating` — boots straight to the generating banner state.
- `?state=preview` — boots straight to the rendered preview state.
- `?theme=light` or `?theme=dark` — sets initial theme.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are intended to be implemented as-shown. Use the exact tokens listed in *Design Tokens*.

---

## Screens / Views

### 1. Top Nav
- 56px sticky bar, hairline bottom border. Left: brand mark + host name + `API` tag. Right: text links (`All games`, `Rules`, `User Profile`) separated by 1×16px dividers, then `Dark`/`Light` mode pill toggle, then `Logout` button.
- **Brand mark:** 28×28 rounded-square, subtle gradient, 1px border, monospace letter glyph.
- **Mode toggle:** clicking flips `[data-theme]` on `<html>` between `dark` and `light`. Icon = moon (dark) or sun (light).

### 2. Create New Game card
- Centered, max-width 1040px, 40px top padding. Card uses `--bg-1`, 1px border `--line-1`, `border-radius: 16px`, soft shadow.
- **Header:** Title `Create New Game` (18px/600). Right: `Generate Preview` button. Button has three states: idle (bolt icon + label), busy (spinning bolt + "Generating…", disabled), and post-success returns to idle.
- **Body fields top-to-bottom:**
    - **Row 1:** Two columns — `Host Name` text input, `Game Title` text input.
    - **Row 2:** Full-width `Description (optional)` textarea (76px min-height).
    - **Row 3:** Two columns with 140px inline labels — `Player Count` select (4–20), `Werewolf Count` select (1–6).
    - **Row 4:** 140px inline label `Players AI` → custom multi-select.
    - **Row 5:** 140px inline label `Special Roles` → toggle chips.

#### Players AI multi-select
- **Trigger:** single row, `min-height: 38px`, 1px border. Contains: circular count badge (monospace), summary text, optional `Fast only` accent pill (only when filter is on), chevron.
- Open state gets `--accent-line` border + 3px `--accent-soft` glow.
- **Popover (6px below):** 1px border, 12px radius, popover shadow, 140ms fade+translate.
- **Header:** search input with leading magnifier icon.
- **Toolbar:** `Fast only` filter pill (left) + `Select visible` / `Clear` text buttons (right).
- **List:** scrollable (max-height 280px), grouped by provider with 10px uppercase monospace labels. Each row: 16×16 custom checkbox (accent-filled when checked), model name + speed tag (`fast` green-tinted, `standard` amber-tinted), `provider · model-id` sub-row.
- When `Fast only` is on: non-fast rows are 0.4 opacity, not clickable. Toggling on auto-selects all fast models. Toggling off lifts restriction but doesn't auto-deselect.
- **Footer:** `<count> selected · <count> shown` monospace + `Done` ghost button.

#### Special Roles toggle chips
- All 5 roles always visible: **Doctor, Detective, Maniac, Seer, Hunter**.
- **Layout:** `border-radius: 8px` (squared), 1px border, `padding: 7px 12px 7px 10px`, gap 8px.
    - Leading 22×22 rounded icon container (border-radius 6px) with role glyph.
    - Label text 13px/500.
    - Trailing 16×16 rounded check square — transparent border unselected, `--accent` filled with `--on-accent` glyph when selected.
- **Unselected:** `--bg-2` fill, `--line-2` border, `--fg-1` text.
- **Hover:** `--bg-3` fill, `--line-3` border, `--fg-0` text.
- **Selected:** `--accent-soft` fill, `--accent-line` border, **`--accent-fg`** text (this is the contrast fix — chip labels are dark blue in light mode, light blue in dark mode, both legible against the soft accent fill).

### 3. Generating banner
- Appears below the card immediately when generation starts.
- 1px border `--info-border`, fill `--info-bg`, `border-radius: 12px`, 14×18px padding, 12px gap.
- **Leading icon block:** 28×28, 8px radius, accent-soft fill, accent-line border, accent-fg foreground. Bolt icon spins (`spin 1.4s linear infinite`).
- **Title:** 14px/600 in `--info-fg`, "Generating Game Preview" with animated trailing dots (CSS `@keyframes` cycling content "" → "." → ".." → "…" every 1.4s).
- **Body:** 13px secondary copy: "The AI is creating your game story and characters. This may take a moment."
- 200ms pop-in animation on appear.
- The original screenshot's banner had purple-blue opaque fill with white-ish text on white-ish background — replace with this restrained, accent-tinted design that works in both themes.

### 4. Game Preview section
Renders below the card after generation completes (~1.8s in the mock).

#### Heading
- `Preview` H1 — 20px/600, letter-spacing -0.01em.

#### Game Story
- Full-width labeled textarea, pre-filled with the generated story. 130px min-height.
- Editable so the user can tweak the AI output.

#### Game Master subsection
- H2 `Game Master` (15px/600) with trailing horizontal rule (flex: 1 line on the right).
- Card (`--bg-1`, 1px border, 12px radius, 16×18 padding):
    - Top meta line: `Voice Provider: <bold value>` in 11px monospace uppercase + 13px sans bold for the value.
    - Two-column grid (`AI Model` select | `Voice` select + voice-preview icon button).
    - Full-width `Voice Style` text input below.
- **Icon button:** 32×32 square with play glyph (or speaker icon), `--bg-2` fill, hover `--bg-3`.

#### Players subsection
- H2 `Players · N of 12` with trailing rule. Count secondary in 12px `--fg-2`.
- One **player card** per generated player:
    - **Head row:** 36×36 round avatar (initial letter), name (14px/600), gender + voice sub (11px monospace), role tag right-aligned. Bottom border.
    - **Role tag:** rounded pill, uppercase 10px. Werewolves use red-tinted variant (`oklch(60% 0.13 25)` bg + border + `oklch(70% 0.13 25)` text). Villagers use neutral.
    - **Two-column grid:** `AI Model` select | `Play Style` select.
    - **Story:** full-width textarea (70px min-height), editable.
    - **Two-column grid:** `Voice Style` text input | `Voice` select + preview button.
- All fields editable so the user can refine the generated content before starting.

---

## Interactions & Behavior

- **All inputs:** focus = `--accent-line` border + 3px `--accent-soft` ring. 120ms transitions on border/background.
- **Theme toggle:** flips `data-theme` attribute on `<html>` between `dark` and `light`. All tokens cascade.
- **Role chips:** click anywhere toggles selection; `aria-pressed` reflects state.
- **AI multi-select:** outside-click closes, search filters by model name OR provider, `Select visible` adds filtered IDs (idempotent), `Clear` empties selection. Toggling Fast-only on auto-selects fast models; off lifts the restriction.
- **Generate Preview flow:**
    1. Click → button enters busy state (spinning bolt, "Generating…" label, disabled).
    2. Banner appears below card with spinning bolt + animated dots.
    3. After ~1.8s, banner is replaced by the Preview section.
    4. Button returns to idle state. Clicking again re-runs the flow.
- **All animations:** chevron rotate 160ms, popover fade+translate 140ms, banner/preview pop 200ms, hover transitions 120ms.

---

## State Management

| Field | Type | Notes |
|---|---|---|
| `name` | string | Host name |
| `title` | string | Game title |
| `description` | string | Optional |
| `playerCount` | string/number | "4"–"20" |
| `werewolves` | string/number | "1"–"6" |
| `roles` | string[] | Selected role IDs |
| `models` | string[] | Selected AI model IDs |
| `genState` | `"idle" \| "generating" \| "done"` | Drives button + banner + preview |
| `preview` | object \| null | Generated content |
| `theme` | `"dark" \| "light"` | Persist to localStorage; reflect on `<html data-theme>` |

AI multi-select holds local UI state for: `open`, `query`, `fastOnly`. These do not persist outside the component.

---

## Design Tokens

### Dark theme (default — `:root` / `[data-theme="dark"]`)

| Token | Value | Usage |
|---|---|---|
| `--bg-0` | `#0b0c0f` | Page background |
| `--bg-1` | `#111317` | Card background, popover |
| `--bg-2` | `#161a20` | Input/trigger background |
| `--bg-3` | `#1d2229` | Hover surface, secondary button |
| `--bg-4` | `#252a33` | Active/pressed surface |
| `--line-1` | `#1f242c` | Hairline dividers |
| `--line-2` | `#2a313b` | Standard input borders |
| `--line-3` | `#3a4250` | Hover/focus border base |
| `--fg-0` | `#ecedef` | Primary text |
| `--fg-1` | `#b9bcc3` | Secondary text, labels |
| `--fg-2` | `#7e848f` | Tertiary text, helper, monospace |
| `--fg-3` | `#555b66` | Muted, placeholder |
| `--accent` | `oklch(72% 0.09 230)` | Selected fills |
| `--accent-soft` | `oklch(72% 0.09 230 / 0.14)` | Selected chip fill, focus ring |
| `--accent-line` | `oklch(72% 0.09 230 / 0.45)` | Selected/focus borders |
| `--accent-fg` | `oklch(96% 0.02 230)` | Text on accent-soft |
| `--on-accent` | `#0b0c0f` | Text/glyph on solid accent |
| `--info-bg` | `oklch(72% 0.09 230 / 0.10)` | Banner fill |
| `--info-border` | `oklch(72% 0.09 230 / 0.40)` | Banner border |
| `--info-fg` | `oklch(85% 0.06 230)` | Banner title text |

### Light theme (`[data-theme="light"]`)

| Token | Value |
|---|---|
| `--bg-0` | `#f5f6f8` |
| `--bg-1` | `#ffffff` |
| `--bg-2` | `#f3f4f6` |
| `--bg-3` | `#eaecef` |
| `--bg-4` | `#dfe2e7` |
| `--line-1` | `#e6e8ec` |
| `--line-2` | `#d4d8de` |
| `--line-3` | `#b7bdc6` |
| `--fg-0` | `#15181d` |
| `--fg-1` | `#3d4450` |
| `--fg-2` | `#6b727d` |
| `--fg-3` | `#9aa0aa` |
| `--accent` | `oklch(55% 0.12 235)` |
| `--accent-soft` | `oklch(55% 0.12 235 / 0.10)` |
| `--accent-line` | `oklch(55% 0.12 235 / 0.45)` |
| `--accent-fg` | `oklch(38% 0.12 235)` |
| `--on-accent` | `#ffffff` |
| `--info-bg` | `oklch(55% 0.12 235 / 0.07)` |
| `--info-border` | `oklch(55% 0.12 235 / 0.35)` |
| `--info-fg` | `oklch(40% 0.12 235)` |

### Semantic accents

- **Fast tag (green):** text `oklch(80% 0.13 145)`, border `oklch(60% 0.10 145 / 0.5)`, bg `oklch(60% 0.10 145 / 0.1)`.
- **Standard tag (amber):** text `oklch(78% 0.10 65)`, border `oklch(60% 0.08 65 / 0.5)`, bg `oklch(60% 0.08 65 / 0.1)`.
- **Werewolf tag (red):** text `oklch(70% 0.13 25)`, border `oklch(60% 0.13 25 / 0.45)`, bg `oklch(60% 0.13 25 / 0.12)`.

### Typography

- **Sans:** Inter, weights 400/500/600/700.
- **Mono:** JetBrains Mono, weights 400/500. Used for: API tag, count badges, model IDs, footer info, preview meta lines.

| Element | Size | Weight |
|---|---|---|
| Preview H1 | 20px | 600 |
| Card title | 18px | 600 |
| Player name | 14px | 600 |
| Body / inputs / chip labels | 13px | 400/500 |
| Banner title / preview H2 | 14–15px | 600 |
| Labels / banner body | 12–13px | 400/500 |
| Helper / monospace info | 11px | 400 |
| Tag/uppercase labels | 10px | 500/600, uppercase, 0.05–0.08em letter-spacing |

### Spacing & Radii

- Card body: 24/28/28px padding. Form rows: 16–18px gap. Inline label column: 140px. Chip gap: 8px.
- Radii: `--radius-sm` 6px, `--radius-md` 8px (inputs, buttons, chips), `--radius-lg` 12px (popover, banner, player card), `--radius-xl` 16px (main card), 999px (count badge, mode toggle, filter pills, role tag).

### Shadows

- `--shadow-1`: `0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.4)` — brand mark.
- `--shadow-2`: `0 8px 24px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)` — main card.
- `--shadow-pop`: `0 16px 40px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4)` — popover.

---

## Assets

All icons are **inline SVG**, drawn from scratch as simple geometric glyphs. Replace with the codebase's existing icon library where natural mappings exist:

| Glyph | Suggested replacement |
|---|---|
| Doctor (cross) | medical/plus icon |
| Detective (magnifier) | search/magnifier icon |
| Maniac (triangle warning) | alert/warning icon |
| Seer (eye) | eye icon |
| Hunter (arrow up-right) | arrow icon |
| Witch (potion) | flask icon (unused but defined) |
| Bolt (fast / generating) | bolt/zap icon |
| Magnifier (search) | search icon |
| Caret (chevron) | chevron-down |
| Check | check |
| Moon/Sun (theme) | moon/sun |
| Play (voice preview) | play / speaker icon |

Brand mark is a single-letter monospace glyph in a gradient square — substitute the actual app logo.

---

## Files

- `Create Game.html` — entry HTML with all global tokens (dark + light) and styles in `<style>`.
- `components.jsx` — reusable components: `Icon` set, `RoleGlyph`, `RoleChip`, `SpecialRoles`, `AIMultiSelect`, `MODELS` data, `ROLES` data.
- `app.jsx` — page composition (nav + form + banner + preview), state, generation flow, theme handling, tweak wiring.
- `tweaks-panel.jsx` — design-time tweak controls (chip style, theme, fast-pill visibility, generation flow trigger). **Not part of production UI**; can be ignored when implementing.

---

## Notes for the implementer

- **Do not introduce purple** anywhere. The accent is a single cool blue; the rest is neutral grey.
- The `Fast only` filter being **inside** the dropdown panel (rather than outside as a stranded checkbox) is the most important UX change — preserve this.
- The role chip's trailing checkbox is intentionally redundant with the fill state — it gives an accessible affordance and a clear visual confirmation of "this is a toggle, not a tag". Keep it.
- In light mode, the originally-faded chip text was a contrast failure. The fix is `--accent-fg` (a darkened version of the accent hue). Don't substitute pure white or pure foreground — the soft accent fill needs the matching accent-foreground for legibility.
- The banner's spinning icon and animated dots are small but make the loading state feel alive. Both are pure CSS (`@keyframes spin` and `@keyframes dots`).
- Speed tags (`fast` / `standard`) on each model row are optional but useful — they let users see why something would be filtered without toggling Fast-only.
- The `?state=` URL params are demo-only — strip them when implementing in production.
