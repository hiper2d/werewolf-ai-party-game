# Design Tokens Specification — Werewolf AI Party Game

## Styling Stack

- **Framework:** Next.js 16.1.6 + React 19.2.0
- **CSS:** Tailwind CSS 3.4.1 (utility-first) + CSS custom properties in `globals.css`
- **Theme:** `data-theme` attribute (`light` | `dark`) on `<html>`, managed by custom `ThemeProvider`
- **Dark mode config:** `darkMode: ['class', '[data-theme="dark"]']` in tailwind.config.ts
- **Component library:** None — all components are custom
- **PostCSS:** 8.x
- **Icons:** Inline SVGs (no icon library)
- **Config files:**
  - `werewolf-client/tailwind.config.ts`
  - `werewolf-client/postcss.config.mjs`
  - `werewolf-client/app/globals.css`
  - `werewolf-client/app/constants.tsx` (button style strings)

---

## Color Tokens

All colors are defined as CSS custom properties in `werewolf-client/app/globals.css` using RGB triplets (no alpha), consumed via `rgb(var(--color-*))` in Tailwind config.

### Light Theme (`[data-theme='light']`)

| Token | RGB Values | Hex | Usage |
|-------|-----------|-----|-------|
| `--color-text-primary` | 15, 23, 42 | #0F172A | Main body text, headings |
| `--color-text-secondary` | 71, 85, 105 | #475569 | Descriptions, labels, muted text |
| `--color-page-bg-start` | 248, 250, 252 | #F8FAFC | Gradient start (body + app-shell) |
| `--color-page-bg-end` | 226, 232, 240 | #E2E8F0 | Gradient end |
| `--color-navbar-bg` | 255, 255, 255 | #FFFFFF | Navbar background |
| `--color-navbar-text` | 15, 23, 42 | #0F172A | Navbar text |
| `--color-navbar-link` | 51, 65, 85 | #334155 | Nav link default |
| `--color-navbar-link-hover` | 15, 23, 42 | #0F172A | Nav link hover |
| `--color-navbar-divider` | 203, 213, 225 | #CBD5E1 | Nav pipe separators |
| `--color-toggle-bg` | rgba(0,0,0,0.05) | — | Theme toggle bg |
| `--color-toggle-hover-bg` | rgba(0,0,0,0.1) | — | Theme toggle hover bg |
| `--color-toggle-border` | rgba(0,0,0,0.15) | — | Theme toggle border |
| `--color-toggle-text` | 30, 41, 59 | #1E293B | Theme toggle text |
| `--color-card-bg` | 255, 255, 255 | #FFFFFF | Card backgrounds |
| `--color-card-border` | 203, 213, 225 | #CBD5E1 | Card borders |
| `--color-card-shadow` | rgba(15,23,42,0.12) | — | Card box-shadow |
| `--color-button-bg` | 15, 23, 42 | #0F172A | Primary button bg |
| `--color-button-text` | 255, 255, 255 | #FFFFFF | Primary button text |
| `--color-button-text-transparent` | 15, 23, 42 | #0F172A | Ghost button text |
| `--color-button-hover-bg` | 30, 41, 59 | #1E293B | Primary button hover |
| `--color-button-transparent-bg` | rgba(15,23,42,0.08) | — | Ghost button bg |
| `--color-button-transparent-hover-bg` | rgba(15,23,42,0.12) | — | Ghost button hover bg |
| `--color-input-bg` | 255, 255, 255 | #FFFFFF | Input background |
| `--color-input-border` | 203, 213, 225 | #CBD5E1 | Input border |
| `--color-input-text` | 15, 23, 42 | #0F172A | Input text |
| `--color-input-placeholder` | 148, 163, 184 | #94A3B8 | Input placeholder |
| `--color-scrollbar-track` | 241, 245, 249 | #F1F5F9 | Scrollbar track |
| `--color-scrollbar-thumb` | 203, 213, 225 | #CBD5E1 | Scrollbar thumb |
| `--color-scrollbar-thumb-hover` | 148, 163, 184 | #94A3B8 | Scrollbar thumb hover |

### Dark Theme (`[data-theme='dark']`)

| Token | RGB Values | Hex | Usage |
|-------|-----------|-----|-------|
| `--color-text-primary` | 240, 240, 245 | #F0F0F5 | Main body text |
| `--color-text-secondary` | 160, 160, 170 | #A0A0AA | Muted text |
| `--color-page-bg-start` | 18, 18, 22 | #121216 | Gradient start |
| `--color-page-bg-end` | 12, 12, 16 | #0C0C10 | Gradient end |
| `--color-navbar-bg` | 18, 18, 22 | #121216 | Navbar bg |
| `--color-navbar-text` | 240, 240, 245 | #F0F0F5 | Navbar text |
| `--color-navbar-link` | 200, 200, 210 | #C8C8D2 | Nav links |
| `--color-navbar-link-hover` | 240, 240, 245 | #F0F0F5 | Nav link hover |
| `--color-navbar-divider` | 120, 120, 130 | #787882 | Nav dividers |
| `--color-toggle-bg` | rgba(255,255,255,0.08) | — | Toggle bg |
| `--color-toggle-hover-bg` | rgba(255,255,255,0.16) | — | Toggle hover bg |
| `--color-toggle-border` | rgba(160,160,170,0.35) | — | Toggle border |
| `--color-toggle-text` | 240, 240, 245 | #F0F0F5 | Toggle text |
| `--color-card-bg` | 32, 32, 38 | #202026 | Card bg |
| `--color-card-border` | 55, 55, 62 | #37373E | Card border |
| `--color-card-shadow` | rgba(0,0,0,0.3) | — | Card shadow |
| `--color-button-bg` | 55, 55, 62 | #37373E | Button bg |
| `--color-button-text` | 240, 240, 245 | #F0F0F5 | Button text |
| `--color-button-text-transparent` | 240, 240, 245 | #F0F0F5 | Ghost button text |
| `--color-button-hover-bg` | 72, 72, 80 | #484850 | Button hover bg |
| `--color-button-transparent-bg` | rgba(255,255,255,0.1) | — | Ghost button bg |
| `--color-button-transparent-hover-bg` | rgba(255,255,255,0.15) | — | Ghost hover bg |
| `--color-input-bg` | 32, 32, 38 | #202026 | Input bg |
| `--color-input-border` | 55, 55, 62 | #37373E | Input border |
| `--color-input-text` | 240, 240, 245 | #F0F0F5 | Input text |
| `--color-input-placeholder` | 120, 120, 130 | #787882 | Input placeholder |
| `--color-scrollbar-track` | 18, 18, 22 | #121216 | Scrollbar track |
| `--color-scrollbar-thumb` | 75, 75, 82 | #4B4B52 | Scrollbar thumb |
| `--color-scrollbar-thumb-hover` | 100, 100, 108 | #64646C | Scrollbar thumb hover |

### Player Colors (hardcoded in `app/utils/color-utils.ts`)

| Color | Hex | Name |
|-------|-----|------|
| Muted blue-grey | `#6B8E9E` | Player color 0 |
| Muted purple-grey | `#8B7B8B` | Player color 1 |
| Muted green-grey | `#7B8B6B` | Player color 2 |
| Muted red-grey | `#8B6B6B` | Player color 3 |
| Muted blue-purple | `#6B6B8B` | Player color 4 |
| Muted yellow-grey | `#8B8B6B` | Player color 5 |
| Muted teal-grey | `#6B8B7B` | Player color 6 |
| Muted purple | `#7B6B8B` | Player color 7 |
| Muted brown-grey | `#8B7B6B` | Player color 8 |
| Muted steel blue | `#6B7B8B` | Player color 9 |
| Game Master | `#FF6B6B` | Coral red |

### Ad-hoc Colors (used inline, not tokenized)

- Status badges: `bg-red-500/20 text-red-400` (evil), `bg-green-500/20 text-green-400` (good) — rules page
- Feature icons: `bg-blue-500/20 text-blue-500`, `bg-purple-500/20 text-purple-500`, `bg-red-500/20 text-red-500` — home page
- Tier colors: `text-green-600 dark:text-green-400` (API), `text-blue-400/70 dark:text-blue-300/60` (Paid), `text-yellow-600 dark:text-yellow-400` (Free) — navbar + profile
- Error: `text-red-500`, `border-red-500`, `bg-red-900 bg-opacity-50` — newgame page
- Warning: `border-yellow-600`, `bg-yellow-100 dark:bg-yellow-900/40` — games list
- Success: `bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400` — profile
- Loading: `text-blue-400`, `bg-blue-900 bg-opacity-50 border-blue-500` — newgame
- Form inputs (newgame): `bg-black bg-opacity-30 text-white border-white border-opacity-30` (hardcoded dark style, ignores theme)

---

## Typography

### Font Families

| Token | Font | Source | CSS Variable | Usage |
|-------|------|--------|-------------|-------|
| `font-inter` | Inter | `next/font/google` | `--font-inter` | Default body font (`font-inter` on `<body>`) |
| `font-mono` | Roboto Mono | `next/font/google` | `--font-roboto-mono` | Available via `font-mono` class, not widely used |

**Source:** `werewolf-client/app/layout.tsx` lines 11-20

### Font Weights in Use

| Weight | Tailwind Class | Where |
|--------|---------------|-------|
| 400 (normal) | default | Body text |
| 500 | `font-medium` | Navbar user name, theme toggle, some labels |
| 600 | `font-semibold` | Section subheadings (h2 on rules, profile) |
| 700 | `font-bold` | Page titles (h1), section headings (h2), card titles (h3) |
| 800 | `font-extrabold` | Hero title on `/`, about page title |

### Font Sizes in Use

| Size | Tailwind Class | Where |
|------|---------------|-------|
| 10px | `text-[10px]` | Tier label on game cards |
| 12px | `text-xs` | Badges, meta info, role tooltips, small labels |
| 14px | `text-sm` | Secondary descriptions, form labels, card descriptions |
| 16px | `text-base` (default) | Body text |
| 18px | `text-lg` | Card titles (h3), role names, game list theme name |
| 20px | `text-xl` | Section headings, feature card titles, buttons |
| 24px | `text-2xl` | Page titles (h1), section headings |
| 30px | `text-3xl` | Rules page h1, privacy/terms h1 |
| 36px / 60px | `text-4xl sm:text-6xl` | Hero title (responsive) |

### Line Heights

- `leading-relaxed` (1.625) — used on body text in about, privacy, terms, hero tagline
- Default Tailwind line heights elsewhere

---

## Spacing

### Tailwind Spacing Scale (values observed in use)

No custom spacing scale — uses default Tailwind.

**Recurring patterns:**
- Page padding: `p-2 sm:p-4 lg:p-6` (responsive, layout.tsx)
- Card padding: `p-6` or `p-8`
- Section margin: `mb-6`, `mb-8`, `mb-12`
- Gap: `gap-2`, `gap-4`, `gap-8`
- Container max-width: `max-w-7xl` (layout), `max-w-4xl` (content pages), `max-w-5xl` (features section), `max-w-sm` (login dialog)

---

## Border Radii

| Value | Tailwind Class | Usage |
|-------|---------------|-------|
| 4px | `rounded` | Buttons (buttonTransparentStyle), game list cards, form inputs |
| 8px | `rounded-lg` | Primary CTA button, cards, modals, banners |
| 12px | `rounded-xl` | Feature cards, login dialog, about page cards |
| 16px | `rounded-2xl` | About page cards |
| 24px | `rounded-3xl` | Features section container on home page |
| 9999px | `rounded-full` | Avatar images, logo backdrop, theme toggle pill, icon circles |

---

## Shadows

| Token / Class | Value | Usage |
|---------------|-------|-------|
| `shadow-card` (Tailwind config) | `0 4px 16px var(--color-card-shadow)` | Theme-aware card shadow |
| `.theme-shadow` (CSS) | `0 4px 16px var(--color-card-shadow)` | Game cards, rules sections |
| `.theme-shadow` (dark override) | `0 4px 24px rgba(0,0,0,0.15), inset 0 0.5px 0 0 rgba(160,160,170,0.12)` | Dark mode enhanced shadow |
| `.navbar-root` | `0 4px 12px var(--color-card-shadow)` | Navbar bottom shadow |
| `shadow-sm` | Tailwind default | Feature cards, about page cards |
| `shadow-lg` | Tailwind default | Hero CTA button |
| `shadow-md` | Tailwind default | Secondary CTA button |
| `shadow-2xl` | Tailwind default | Login dialog |

---

## Motion / Transitions

| Property | Value | Where |
|----------|-------|-------|
| Color transition | `transition: color 150ms ease` | `.nav-link` |
| Background transition | `transition: background-color 150ms ease, border-color 150ms ease` | `.theme-toggle` |
| General transition | `transition-colors` (Tailwind) | Buttons, links throughout |
| All transition | `transition-all` (Tailwind) | Hero CTA button |
| Transform hover | `transform hover:scale-105` | Hero CTA button |
| Spin animation | `animate-spin` | Loading spinner emoji |
| Backdrop blur | `backdrop-blur-sm` | Login dialog overlay |
| Glassmorphism | `backdrop-filter: blur(10px)` | Dark theme `.theme-bg-card` |

---

## Icons

**Library:** None. All icons are inline SVGs.

**Stroke settings:** `strokeWidth="2"`, `strokeLinecap="round"`, `strokeLinejoin="round"` (consistent)

**Icons in use:**
| Icon | Location | Description |
|------|----------|-------------|
| Hamburger (3 lines) | `navbar.tsx` | Mobile menu open |
| Close (X) | `navbar.tsx`, `login-dialog.tsx` | Mobile menu close, dialog close |
| Moon | `ThemeSwitcher.tsx` | Light mode indicator |
| Sun | `ThemeSwitcher.tsx` | Dark mode indicator |
| GitHub logo | `login-dialog.tsx` | OAuth button |
| Google logo (4 colors) | `login-dialog.tsx` | OAuth button |
| People (users) | `page.tsx` (home) | Feature card icon |
| Lightning bolt | `page.tsx` (home) | Feature card icon |
| Shield check | `page.tsx` (home) | Feature card icon |
| Info circle | `newgame/page.tsx` | Role/playstyle tooltip trigger |

---

## Glassmorphism / Special Effects

**Dark theme glassmorphism** (globals.css lines 93-97):
```css
[data-theme='dark'] .theme-bg-card {
  background-color: rgba(32, 32, 38, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
```

**Logo backdrop gradient** (globals.css lines 243-256):
- Light: `radial-gradient(circle, #1e293b 35%, rgba(248, 250, 252, 0) 70%)`
- Navbar: `radial-gradient(circle, #1e293b 40%, rgba(255, 255, 255, 0) 70%)`

**Body background gradient** (globals.css lines 120-125):
```css
background: linear-gradient(160deg,
    rgba(var(--color-page-bg-start), 0.96) 0%,
    rgba(var(--color-page-bg-end), 0.92) 100%);
background-attachment: fixed;
```

---

## Static Assets

| File | Size | Usage |
|------|------|-------|
| `/public/werewolf-ai-logo-2.png` | 378 KB | Logo in navbar (50x50), hero (144x144 to 208x208), about page (128x128) |
| `/public/mememan.webp` | 22 KB | Default user avatar fallback |

---

## Tailwind Config Extensions (tailwind.config.ts)

```typescript
colors: {
  primary: 'rgb(var(--color-text-primary))',
  secondary: 'rgb(var(--color-text-secondary))',
  card: { DEFAULT, border },
  btn: { DEFAULT, text, 'text-transparent', hover, transparent, 'transparent-hover' },
  input: { DEFAULT, border, text, placeholder },
},
fontFamily: {
  inter: ['var(--font-inter)'],
  mono: ['var(--font-roboto-mono)'],
},
boxShadow: {
  card: '0 4px 16px var(--color-card-shadow)',
},
backgroundImage: {
  'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
},
```

---

## Custom CSS Classes (globals.css)

| Class | Purpose | Scope |
|-------|---------|-------|
| `.navbar-root` | Navbar container styling | NavBar |
| `.nav-link` | Nav link color + transition | NavBar |
| `.nav-divider` | Pipe separator color | NavBar |
| `.theme-toggle` | Toggle pill styling | ThemeSwitcher |
| `.theme-toggle-label` | Toggle label typography | ThemeSwitcher |
| `.theme-icon` | Icon sizing (1.25rem) | ThemeSwitcher |
| `.theme-name` | Small-caps variant | ThemeSwitcher |
| `.app-shell` | Main content gradient | layout.tsx |
| `.theme-text-primary` | Primary text color | Everywhere |
| `.theme-text-secondary` | Secondary text color | Everywhere |
| `.theme-bg-card` | Card background (+ glassmorphism in dark) | Cards everywhere |
| `.theme-border` | Card border color | Cards, sections |
| `.theme-border-subtle` | Subtle border (50% opacity) | Profile sections |
| `.theme-shadow` | Card shadow | Cards, sections |
| `.logo-backdrop` | Large logo gradient bg | Home hero |
| `.logo-backdrop-sm` | Small logo gradient bg | Navbar |
| `.hide-scrollbar` | Hide scrollbar utility | Profile sidebar |

---

## Button Style Constants (app/constants.tsx)

```typescript
buttonTransparentStyle = `text-btn-text-transparent bg-btn-transparent border border-card-border
    hover:bg-btn-transparent-hover px-4 py-2 rounded`

buttonBlackStyle = "text-btn-text bg-btn hover:bg-btn-hover p-3"
```

**Additional one-off button styles:**
- Hero CTA: `px-8 py-4 bg-btn text-btn-text rounded-lg font-bold text-xl hover:bg-btn-hover transition-all transform hover:scale-105 shadow-lg`
- Hero secondary: `px-8 py-4 bg-transparent border-2 border-btn text-btn rounded-lg font-bold text-xl hover:bg-btn/10 transition-all shadow-md`
- Create Game: `text-btn-text bg-btn hover:bg-btn-hover p-3 text-xl rounded` (inline, similar to buttonBlackStyle)

---

## Known Inconsistencies

1. **Newgame form ignores theme** — Uses hardcoded `bg-black bg-opacity-30 text-white border-white border-opacity-30` for inputs, which works on dark but looks wrong on light theme.

2. **Mixed card styling** — Some cards use `.theme-bg-card .theme-border .theme-shadow` CSS classes, others use direct Tailwind like `bg-white dark:bg-neutral-900` (login dialog) or `bg-gray-900 bg-opacity-50` (newgame preview).

3. **Loading text color** — `newgame/page.tsx` line 278 uses `text-white` hardcoded for loading state.

4. **Ad-hoc color values** — Status/tier/error colors are not tokenized; they use Tailwind palette colors directly (red-500, green-400, yellow-600, blue-400, etc.).

5. **Spacing inconsistency** — Cards use both `p-6` and `p-8` padding with no clear rule for when to use which.
