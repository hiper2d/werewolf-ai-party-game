# Handoff: "Join the Discord" button

A community invite that links to the project's Discord server. It lives in three places, each with a
slightly different treatment, but all built from the **shared app design tokens** so dark/light
parity is automatic. The icon is the official Discord mark (a filled glyph — the only filled icon in
an otherwise stroked icon set; that's intentional, it reads as a recognizable brand logo).

This document is written for implementing the button in the **real codebase** (not the prototype).
The prototype source files at the bottom are the design reference.

---

## 0. One thing to wire first — the invite URL

Everything points at a single constant, currently a placeholder:

```
https://discord.gg/your-invite
```

Replace it with the real invite link. Define it **once** (env var, config, or a `DISCORD_URL`
constant) and reference it everywhere. Always render as an `<a>` that opens a new tab:
`target="_blank" rel="noopener noreferrer"`.

---

## 1. Where it goes

| Placement | Treatment | Rationale |
|---|---|---|
| **Landing hero** (primary) | Ghost action button, third in the CTA row after `Go to Game Lobby` (primary) and `How to Play` (ghost). | First-touch conversion. Ghost styling keeps it below the lobby CTA so it doesn't compete. |
| **Landing footer** (persistent) | Plain text link in the footer link row (`About · Discord · Privacy · Terms · GitHub`), 2nd position. | Standard quietly-findable pattern. |
| **Game Chat sidebar** (in-app) | Subtle bordered pill pinned at the bottom of the participants sidebar. | Reaches players mid-game — the moment they have a story to share or feedback to give. |

There is also a larger **"Join the community" band** above the landing footer (icon + heading +
blurb + button); if you want it, its markup/CSS is in the prototype too, but the three placements
above are the core ask.

**Deliberately NOT** a top-nav item — the nav is already dense, and the hero button covers
first-touch.

---

## 2. The icon

Official Discord mark, inline SVG, `fill="currentColor"` so it inherits text color. File:
`design_handoff_discord/discord-mark.svg`. As a React/JSX glyph for the shared `Icon` set:

```jsx
Discord: () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.07.07 0 0 0-.074.035c-.16.285-.338.657-.462.95a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.47-.95.072.072 0 0 0-.074-.035 19.74 19.74 0 0 0-3.76 1.169.066.066 0 0 0-.03.027C2.27 7.99 1.6 11.51 1.93 14.99a.08.08 0 0 0 .031.055 19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028ZM8.02 12.876c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
  </svg>
)
```

> If the codebase already standardizes social icons (e.g. a `lucide`/`simple-icons` set), prefer that
> component over pasting the path. Just keep `fill: currentColor` and an 18px box.

---

## 3. Markup per placement

### a) Landing hero CTA (ghost button)
Reuse the existing button classes — no new button style needed, just add the `btn-discord` modifier
for icon spacing.

```html
<div class="hero-cta">
  <button class="btn btn-lg btn-primary">Go to Game Lobby</button>
  <button class="btn btn-lg btn-ghost">How to Play</button>
  <a class="btn btn-lg btn-ghost btn-discord" href="{DISCORD_URL}"
     target="_blank" rel="noopener noreferrer">
    <!-- Discord icon --> Join the Discord
  </a>
</div>
```

### b) Landing footer (text link)
```html
<div class="footer-links">
  <a href="#">About the Project</a>
  <a href="{DISCORD_URL}" target="_blank" rel="noopener noreferrer">Discord</a>
  <a href="#">Privacy Policy</a>
  <a href="#">Terms of Service</a>
  <a href="#">GitHub</a>
</div>
```

### c) Game Chat sidebar (bordered pill, pinned bottom)
Place it as the **last child** of the sidebar, after the scrolling `.participants` list. The list is
`flex: 1`, so this sits flush at the bottom.

```html
<aside class="sidebar">
  <!-- header, section label -->
  <div class="participants">…</div>
  <a class="sidebar-discord" href="{DISCORD_URL}" target="_blank" rel="noopener noreferrer"
     title="Join the Werewolf AI Discord">
    <!-- Discord icon --> <span>Join the Discord</span>
  </a>
</aside>
```

---

## 4. Styles

Only the two new rules below are needed. The hero button reuses `.btn`, `.btn-lg`, `.btn-ghost`;
the footer link reuses `.footer-links a`. All use shared tokens → automatic dark/light parity.

```css
/* Icon spacing for any Discord button that reuses .btn */
.btn-discord { display: inline-flex; align-items: center; gap: 9px; white-space: nowrap; }
.btn-discord svg { width: 18px; height: 18px; }

/* Game Chat sidebar pill */
.sidebar-discord {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 9px;
  margin: 0 10px 12px; padding: 9px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line-2); background: var(--bg-1);
  color: var(--fg-1); text-decoration: none;
  font-size: 12.5px; font-weight: 500;
  transition: background-color 130ms, border-color 130ms, color 130ms;
}
.sidebar-discord svg { width: 17px; height: 17px; flex-shrink: 0; color: var(--accent-fg); }
.sidebar-discord:hover {
  background: var(--accent-soft); border-color: var(--accent-line); color: var(--fg-0);
}
```

Responsive: on the **community band** the button goes full-width below 720px. Scope that to the band
so it never widens the hero button:

```css
@media (max-width: 720px) {
  .community-cta .btn-discord { width: 100%; justify-content: center; }
}
```

---

## 5. Tokens used
| Token | Role |
|---|---|
| `--line-2` → `--accent-line` (hover) | Border (sidebar pill, ghost button) |
| `--fg-1` → `--fg-0` (hover) | Label color |
| `--accent-soft` | Hover fill |
| `--accent-fg` | Discord glyph color in the sidebar pill |
| `--bg-1` | Sidebar pill rest fill |
| `--radius-md` | Sidebar pill corner |

## 6. States & behavior
- **Hero button** — ghost at rest (transparent, `--line-2` border, `--fg-1`); hover fills `--bg-1`,
  border `--line-3`, label `--fg-0` (inherited from `.btn-ghost`). Sits visually below the primary
  lobby CTA by design.
- **Footer link** — `--fg-1`, hover `--fg-0` (inherited from `.footer-links a`).
- **Sidebar pill** — hairline border at rest; hover washes `--accent-soft`, border `--accent-line`,
  label `--fg-0`, 130ms.
- All three open the invite in a **new tab**.
- The Discord glyph is the one **filled** icon in the set — keep it filled, don't restyle to stroke.

## 7. Accessibility
- Icon is decorative next to a text label → `aria-hidden="true"` on the inline SVG (the standalone
  asset file keeps an `aria-label` for when it's used without text).
- The sidebar pill carries a `title` for the hover tooltip; the visible "Join the Discord" text is
  the accessible name.

---

## Source files (design reference — prototype, not production)
- `design_handoff_discord/discord-mark.svg` — the icon asset.
- `design_handoff_landing/landing-app.jsx` — `Icon.Discord`, the hero CTA, `Community` band, and
  `Footer` link. `DISCORD_URL` constant at the top.
- `design_handoff_landing/Landing Page.html` — `.btn-discord` + `.community` CSS.
- `chat-components.jsx` — `.sidebar-discord` markup in `Sidebar`.
- `Game Chat.html` — `.sidebar-discord` CSS.
