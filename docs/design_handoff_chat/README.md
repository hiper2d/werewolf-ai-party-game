# Handoff: Game Chat — page redesign

## Overview
Redesign of the in-game **Chat** page in the Werewolf app — the screen used during day-discussion phases. Companion to the Create Game handoff (same design tokens, same theme system).

Key changes vs. the previous design:
1. **Three-column shell** — Sidebar (participants + cost) · Chat stream · Discussion Queue panel.
2. **Per-character avatars** — deterministic hash → 12-color palette. GM gets a green gradient + `GM` mark. "You" gets a soft accent-fill row + blue name + `you` chip.
3. **Role visibility tags** — your own role, fellow werewolves (when you are one), and dead players' revealed roles are shown as small uppercase mono chips beside the name.
4. **Dead-player treatment** — desaturated avatar with overlaid `✕`, strikethrough name, sub-line shows revealed role + cause + day/night.
5. **GM rail** — Game Master messages get a green left rail + soft green tint instead of the previous flat color block.
6. **Cost display is hover-only** by default, with a `$ on/off` toggle to pin it visible.
7. **Thinking state** — skeleton bubble with shimmering lines + "X is thinking…" italic label; composer disables with a pulsing-dot hint.
8. **Discussion Queue** — idle state with bot illustration + helper copy; live state with numbered queue (`Current` / `Up next` / strike-through `Done`) and gradient progress bar.
9. **Modals** — Select Bots to Respond and Change AI Model both polished, centered, backdrop-blur, consistent token system.
10. **Light theme parity** — full token set; tags and rails remain readable in both modes.

## About the Design Files
The files in this bundle (`Game Chat.html`, `chat-app.jsx`, `chat-components.jsx`, `chat-data.jsx`, `tweaks-panel.jsx`) are **design references created in HTML** — a working prototype showing intended look and behavior. They are not production code. Recreate this design in the existing Werewolf codebase, using its component library and styling conventions.

To run the prototype: open `Game Chat.html` in any browser. No build step. URL params:
- `?theme=light` or `?theme=dark` — sets initial theme.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are intended to be implemented as-shown. Tokens and behavior tables below are the source of truth.

---

## Layout

CSS Grid, three columns, full viewport height under the 56px top nav.

| Column            | Width  | Notes                                                                |
|-------------------|--------|----------------------------------------------------------------------|
| Sidebar           | 280px  | Independent vertical scroll for participants list                    |
| Chat              | 1fr    | Flex column: header (fixed) → stream (scroll) → composer (fixed)     |
| Discussion Queue  | 320px  | Hidden below 1024px viewport (responsive)                            |

Background scale: viewport `--bg-base` → sidebar/queue `--bg-1` → chat column `--bg-0` → cards/inputs `--bg-2`. Hairline borders (`--line-1`) separate columns.

---

## Sidebar

### Header block
- **Game title** — 18px / 600.
- **Meta row** — three items separated by `·`:
    - Cost pill: `$0.0000` with leading green dot. Title attr: `Total game cost so far`.
    - Alive count: `10/12 alive` (alive non-GM / total non-GM).
    - Phase: `Day 2`.

### Participants section
- Section label `PARTICIPANTS` (10px mono, uppercase, tracked) on the left; `$ on`/`$ off` cost-toggle pill on the right.
- List is independently scrollable; rows are 8px gap, full width.

### Participant row
- 32×32 avatar (rounded-full), name + tags line, sub-line, optional cost on right.
- **Avatar gradient** — deterministic by name hash; 12-color palette (see `chat-data.jsx`). GM uses a fixed green gradient. Dead players: avatar is grayscaled and overlaid with `✕` glyph in the center.
- **Name line** — name (13px / 500, ellipsis); inline tags follow with 6px gap, wrap allowed.
- **Sub-line** — 11px mono, `--fg-2`. Shows model name for AI players, `Playing as you` for the human, death info for dead players.
- **Cost** — 10px mono, `--fg-3`, right-aligned, opacity 0 → 1 on hover (or always 1 when toggle is on). Hidden for "you" and dead players.
- **Click target** — entire row is clickable for AI players (opens Change Model modal). "You" and dead players are not clickable.
- **Hover** — `--bg-1` background. "You" row has a permanent `--accent-soft` background.
- **GM row** — green name color, no cost shown.

### Role visibility logic
Computed by `getRoleVisibility(participant, viewer)`:

| Subject                                   | Tag visible? | Where shown                                 |
|-------------------------------------------|--------------|---------------------------------------------|
| GM                                        | No tag       | Existing GM treatment (green name + avatar) |
| You (the viewer)                          | Yes          | Beside name in sidebar AND in messages      |
| Another player when *you* are a werewolf and *they* are a werewolf | Yes (variant `fellow-wolf`) | Sidebar + messages |
| Dead player                               | Yes (variant `dead`)        | Death sub-line + messages         |
| Anyone else (alive, not on your team)     | Hidden       | —                                            |

This is a hard rule — never leak roles the human player wouldn't legitimately know in werewolf.

### Role tag styles
Small uppercase mono pill, 9px / 600, 1px solid 5-px-radius, `letter-spacing: 0.08em`. One color per role; alive variants use a tinted fill, `dead` variant uses transparent fill + outline.

| Role        | Hue (oklch H)  | Visual                                                |
|-------------|----------------|-------------------------------------------------------|
| `werewolf`  | 25  (red)      | Tinted red fill + red border + bright-red text        |
| `doctor`    | 145 (green)    | Tinted green                                          |
| `detective` | 70  (amber)    | Tinted amber                                          |
| `maniac`    | 320 (magenta)  | Tinted magenta                                        |
| `villager`  | (neutral)      | `--bg-2` fill, `--fg-2` text, `--line-2` border       |
| `dead` variant (any role) | —    | Transparent fill, neutral border, `--fg-3` text, 0.85 opacity |

### Death sub-line
For dead participants the sub-line replaces the model name with:
`<RoleTag variant="dead">VILLAGER</RoleTag> <span>Killed · Night 1</span>`
- Cause is `Killed · Night N` (werewolf attack) or `Lynched · Day N` (vote-out).
- Whole row gets `opacity: 0.78`; brightens to 1 on hover with a `--bg-1` background so dead players are still selectable for inspection.

### Cost toggle
- Pill button to the right of the section label. Off: ghost outline. On: `--accent-soft` fill, `--accent-fg` text, `--accent-line` border.
- Persists costs visible regardless of hover.

---

## Chat column

### Chat header
- 56px tall, hairline bottom border, 24px horizontal padding.
- Left: phase tag (`Day 2`) + title (`Day discussion`, 16px / 600).
- Right: message count (`9 messages`, 12px mono, `--fg-2`).

### Message stream
- Vertical scroll, 24px horizontal padding, 16px gap between message groups.
- Each group: 36×36 avatar on the left, message column on the right.
- **Header row** — author name (clickable to change model) + optional role tag + optional cost ($ format) + hover-revealed action buttons (read-aloud, delete).
- **Bubble** — `--bg-2` background, 1px `--line-1` border, 14px radius, 12px / 16px padding. Body text `--fg-0` 14px / 1.55.
- **Author wrap nit** — author + model + cost may wrap to a second line at narrow widths. Acceptable; do not constrain.

### Author treatments
| Author class | Visual                                                                        |
|--------------|-------------------------------------------------------------------------------|
| `gm`         | Green name; bubble has a 3px green left rail + soft green tint (8% green over `--bg-2`) |
| `you`        | Blue name; bubble has soft accent tint (`--accent-soft`) + 1px `--accent-line` border  |
| `werewolf` (visible to viewer) | Red name; standard bubble                                  |
| (default)    | `--fg-0` name; standard bubble                                                 |

When a viewer is a werewolf, fellow-werewolf authors get the `werewolf` class even if they are not "you". `you` always wins over `werewolf` in the className chain.

### Message header role tag
The same `<RoleTag>` rendered in the sidebar appears beside the author's name in the message header when `getRoleVisibility(author, viewer).visible` is true (and `reason !== 'dead'` — dead players don't appear in the active stream in the prototype, but if they did, the tag would render as the `dead` variant).

### Action buttons (hover-revealed)
Float above the message header on the right. Two icons:
- **Read aloud** — speaker icon. Toggles between idle and active state (active = accent-tinted bg, accent icon).
- **Delete** — `✕` icon. Click opens a small popover (`role="menu"`) with two destructive choices:
    - `Delete from here (incl.)` — danger color, scissor icon.
    - `Delete after this message` — warning color, forward icon.
- Popover closes on outside click. Both actions take the message id; behavior is left to the consuming app.

### Thinking state
Replaces a message bubble while a model is generating its response.
- Same avatar + author header (with `… is thinking` italic label appended after the name).
- Bubble: skeleton with three shimmering placeholder lines (last one 60% width); shimmer is a 1.4s linear gradient sweep using `--bg-1`/`--bg-2`.
- Three bouncing dots (`.dot.bounce`) play at 0/0.15/0.3s offsets to confirm activity.
- While any thinking bubble is on screen, the composer is disabled and shows `… {Name} is replying` muted-pulsing copy below the input.

---

## Composer

The composer has **two states**: `collapsed` (default) and `expanded`. State is driven by a single `expanded: boolean` plus a className on the wrapper (`.composer-collapsed` / `.composer-expanded`).

### Collapsed (default — also the mobile-optimized state)
- Single-line input, ~40px tall (min-height 40, max-height 56).
- Action bar **fully hidden** — Send, Vote, Go on, mic, lightbulb all gone.
- Hint text hidden.
- Cursor is `text` over the whole composer card; clicking anywhere expands it.

### Expanded
- Input min-height 140px; auto-grows up to 280px max as the user types, then scrolls internally.
- Action bar slides in:
    - **Primary buttons (left):** `Send` (accent fill), `Vote` (ghost outline, check icon), `Go on` (ghost outline, fast-forward icon — tells AI bots to continue without user input).
    - **Icon buttons (right):** `Mic` (voice input), `Lightbulb` (hint).
- Hint text shows below the card if a hint is set (e.g. "X is replying" while disabled).

### Transitions between states
- **Expand on:** click anywhere within the composer card, OR input focus.
- **Collapse on:** mousedown anywhere outside the composer wrapper. **Always collapses** — do not gate on "input is empty". The draft text is preserved across collapse/expand.
- Animate on the bar: `max-height` (0 → 60px), `opacity` (0 → 1), `padding`, ~200ms ease.
- Animate on the textarea: `min-height` (40px → 140px), 180ms ease.
- Use `overflow: hidden` on `.composer-bar` so it slides cleanly.

### Implementation
- One `useState` (`expanded`). Wrapper className toggles `.composer-collapsed` / `.composer-expanded`.
- Auto-size the textarea on every value change AND on state change: reset `height: auto`, set to `scrollHeight`, clamp by min/max for the current state.
- Outside-click detection: `mousedown` listener on `document`, gated by a ref to the composer wrapper, registered only while `expanded === true`.
- Behavior is identical on desktop and mobile — no media queries needed for this feature. The collapsed state IS the mobile design.
- **Disabled state** (AI thinking): opacity 0.5, no pointer events; the hint text below the card shows muted "… {Name} is replying" copy. Disabled does not auto-expand.

### Acceptance
- On page load → composer is collapsed (one line, no buttons visible).
- Click on the composer → smoothly expands; cursor lands in input; buttons appear.
- Click on a chat message or sidebar → composer collapses; any typed text is preserved (verify by re-expanding).
- Typing more text in expanded state grows the input up to ~280px, then scrolls.
- No layout jump when toggling — smooth animation only.

---

## Discussion Queue (right column)

### Idle state
Shown when no bots are queued for the next turn.
- Bot illustration (40×40, `Icons.Bot`) inside a 64×64 circle with a subtle pulsing accent ring (3s ease-in-out, scale 1 → 1.08, opacity 0.6 → 0.2).
- Headline: `Auto-discussion paused`.
- Helper copy (italic, `--fg-2`): explains that bots will respond after the player speaks, or the player can manually pick which bots respond.
- Outline button: `Select bots manually` (opens Select Bots modal).

### Live state
- Headline: `Discussion Queue` + small mono badge `3 of 5` (current / total).
- List of queued items, one row each. Status drives the visual:

| Status     | Visual                                                                            |
|------------|-----------------------------------------------------------------------------------|
| `done`     | Number circle: dim outline. Name: strikethrough, `--fg-3`. No metadata shown.     |
| `current`  | Number circle: accent fill + pulsing dot in the corner. Row: accent-soft bg, accent border. Status text: italic `replying…` |
| `next`     | Number circle: solid `--bg-2`, `--fg-1` numeral. Row: standard bubble.            |

- Footer: gradient progress bar (`--accent-soft` → `--accent`) sized to `current / total`. Below it: `1 done · 1 replying · 3 up next` mono summary.

---

## Modals

Both modals share the same chrome:
- Full-viewport backdrop: `rgba(0,0,0,0.5)` + `backdrop-filter: blur(6px)`.
- Centered card, 480–560px wide, 16px radius, soft shadow, 1px `--line-1` border.
- Header: title + close `✕` button. Footer: secondary action left (or empty), primary action right.
- ESC closes; click on backdrop closes; tab focus is trapped.

### Change AI Model
Triggered by clicking a participant row or message author name.
- Header subtitle: shows player avatar + name + `Currently using: <model>`.
- Search input at the top (filters across providers).
- List grouped by provider (Anthropic, OpenAI, DeepSeek, Google, xAI, Moonshot). Each provider header is sticky-ish: 11px mono uppercase, `--fg-2`.
- Each row: custom radio (16px circle, accent-filled when selected) + model name + tag pills (`fast`, `thinking`).
- Footer: `Cancel` (ghost) · `Apply` (accent, disabled until selection differs).

### Select Bots to Respond
Triggered by the hand icon in the composer or `Select bots manually` in the queue.
- Subtitle: `Pick which bots respond next, in what order, and how many messages each sends.`
- List of all alive non-GM bots. Each row:
    - Order badge — circle on the far left. Empty (outline) when not selected; accent-filled with the order number (1, 2, 3…) when selected. Click toggles selection.
    - Avatar + name.
    - Message count stepper on the right: `–` button, mono number, `+` button. Range 1–5. Stepper is disabled while the bot is unselected.
- Footer: left = mono summary `3 selected · 5 messages total`. Right = `Cancel` · `Start` (accent, disabled at 0 selected).

---

## Tokens (paste into the codebase)

Same token system as the Create Game handoff. If both pages live in the same app, define these once globally.

### Dark (default)
```css
--bg-base: oklch(15% 0.005 250);
--bg-0:    oklch(17% 0.005 250);
--bg-1:    oklch(20% 0.005 250);
--bg-2:    oklch(23% 0.006 250);
--bg-3:    oklch(27% 0.007 250);
--line-1:  oklch(28% 0.008 250);
--line-2:  oklch(34% 0.009 250);
--line-3:  oklch(42% 0.010 250);
--fg-0:    oklch(96% 0.005 250);
--fg-1:    oklch(82% 0.008 250);
--fg-2:    oklch(64% 0.010 250);
--fg-3:    oklch(48% 0.010 250);
--accent:       oklch(62% 0.16 240);
--accent-hover: oklch(67% 0.16 240);
--accent-soft:  color-mix(in oklch, oklch(62% 0.16 240) 14%, transparent);
--accent-line:  color-mix(in oklch, oklch(62% 0.16 240) 35%, transparent);
--accent-fg:    oklch(78% 0.13 240);
--on-accent:    oklch(98% 0 0);
--gm-fg:        oklch(75% 0.12 145);
--gm-rail:      oklch(60% 0.14 145);
--gm-tint:      color-mix(in oklch, oklch(60% 0.14 145) 8%, transparent);
--you-fg:       var(--accent-fg);
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

### Light
```css
[data-theme="light"] {
    --bg-base: oklch(98% 0.003 250);
    --bg-0:    oklch(99.5% 0.002 250);
    --bg-1:    oklch(97% 0.004 250);
    --bg-2:    oklch(94% 0.005 250);
    --bg-3:    oklch(90% 0.006 250);
    --line-1:  oklch(88% 0.006 250);
    --line-2:  oklch(80% 0.008 250);
    --line-3:  oklch(70% 0.010 250);
    --fg-0:    oklch(20% 0.010 250);
    --fg-1:    oklch(34% 0.010 250);
    --fg-2:    oklch(50% 0.010 250);
    --fg-3:    oklch(62% 0.010 250);
    --accent:       oklch(54% 0.18 240);
    --accent-hover: oklch(48% 0.18 240);
    --accent-soft:  color-mix(in oklch, oklch(54% 0.18 240) 12%, transparent);
    --accent-line:  color-mix(in oklch, oklch(54% 0.18 240) 35%, transparent);
    --accent-fg:    oklch(38% 0.18 240);
    --on-accent:    oklch(99% 0 0);
    --gm-fg:        oklch(40% 0.13 145);
    --gm-rail:      oklch(50% 0.14 145);
    --gm-tint:      color-mix(in oklch, oklch(50% 0.14 145) 10%, transparent);
}
```

### Avatar palette (12 hues)
```js
[
    ['oklch(60% 0.18 25)',  'oklch(45% 0.18 25)'],   // red
    ['oklch(65% 0.16 60)',  'oklch(50% 0.16 60)'],   // orange
    ['oklch(70% 0.14 90)',  'oklch(55% 0.14 90)'],   // amber
    ['oklch(65% 0.14 145)', 'oklch(50% 0.14 145)'],  // green
    ['oklch(63% 0.13 195)', 'oklch(48% 0.13 195)'],  // teal
    ['oklch(60% 0.14 230)', 'oklch(45% 0.14 230)'],  // blue
    ['oklch(58% 0.16 270)', 'oklch(42% 0.16 270)'],  // indigo
    ['oklch(60% 0.18 310)', 'oklch(45% 0.18 310)'],  // magenta
    ['oklch(63% 0.16 345)', 'oklch(48% 0.16 345)'],  // pink
    ['oklch(58% 0.10 110)', 'oklch(45% 0.10 110)'],  // olive
    ['oklch(62% 0.12 175)', 'oklch(48% 0.12 175)'],  // cyan
    ['oklch(58% 0.14 290)', 'oklch(42% 0.14 290)'],  // violet
]
```
Hash function in `chat-data.jsx`: `Σ (charCode × 31^i) | 0`, then `% 12`. Use the same algorithm in production so avatars are stable across page loads.

---

## Data shape

```ts
type Role = 'gm' | 'villager' | 'werewolf' | 'doctor' | 'detective' | 'maniac';

interface Participant {
    id: string;
    name: string;
    model: string | null;        // null for the human "you"
    cost: number;                // session cost in USD
    role: Role;
    you?: boolean;               // true on exactly one participant
    dead?: boolean;
    deathDay?: number;           // present when deathCause === 'lynched'
    deathNight?: number;         // present when deathCause === 'killed'
    deathCause?: 'killed' | 'lynched';
}
```

```ts
function getRoleVisibility(p: Participant, viewer: Participant) {
    if (p.role === 'gm') return { visible: false };
    if (p.dead)         return { visible: true, reason: 'dead' as const };
    if (p.you || viewer?.id === p.id) return { visible: true, reason: 'self' as const };
    if (viewer?.role === 'werewolf' && p.role === 'werewolf') {
        return { visible: true, reason: 'fellow-wolf' as const };
    }
    return { visible: false };
}
```

This single function is the only place role visibility is decided. Do not branch on role anywhere else in the UI.

---

## Asset / icon mapping

The prototype draws inline SVG icons. Substitute with the codebase's existing icon library where available; only fall back to bespoke SVG if no equivalent exists.

| Prototype icon         | Used in                        | Suggested name in your icon set |
|------------------------|--------------------------------|---------------------------------|
| Bolt                   | brand mark, generate-button    | `bolt` / `zap`                  |
| Send (paper-plane)     | composer primary               | `send`                          |
| Check                  | Vote button, queue done        | `check`                         |
| Forward (>>)           | Go on, delete-after            | `fast-forward`                  |
| Mic                    | composer right cluster         | `mic`                           |
| Lightbulb              | composer right cluster         | `lightbulb` / `hint`            |
| Hand                   | composer → open Select Bots    | `hand` / `select`               |
| Speaker                | message read-aloud             | `volume`                        |
| ✕                      | message delete, modal close, dead-mark overlay | `x` / `close`   |
| Cut (scissors)         | delete-from-here               | `scissors`                      |
| Bot                    | queue idle illustration        | `bot` / `robot`                 |
| Search                 | Change Model search input      | `search`                        |
| Plus / Minus           | Select Bots stepper            | `plus`, `minus`                 |
| Moon / Sun             | theme toggle                   | `moon`, `sun`                   |

---

## Behavior summary

- **Cost toggle** persists per session (the prototype keeps it in component state; production should use the same store as the Create Game cost preferences if they share one).
- **Click participant row → Change Model** (live AI players only; "you" and dead are not clickable).
- **Click author name in a message → Change Model** (same scope).
- **Hover message → reveal action buttons.**
- **Delete popover**: outside-click closes; both actions return `(messageId, mode)` where mode is `'incl'` or `'after'`.
- **ESC closes any open modal**; backdrop click closes; focus is trapped while open.
- **Discussion Queue auto-collapses** below 1024px viewport. The composer's hand icon stays available so users can still open Select Bots.
- **No purple anywhere.** The brand-blue accent and per-character avatar gradients are the only saturated colors. Role tags use their own hue family but never appear elsewhere.

---

## Tweaks panel
The prototype includes a Tweaks toggle (toolbar). Production does not need this — the panel is purely for design iteration. Ignore `tweaks-panel.jsx` and the `useTweaks` hook when porting.
