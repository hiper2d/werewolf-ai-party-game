# All Screens Specification — Werewolf AI Party Game

Every control, element, and state on every screen. Use as ground truth — do not invent controls not listed here, do not omit controls listed here.

The game screen (`/games/[id]`) is documented separately in `GAME_SCREEN_SPEC.md`.

---

## SHARED: Navbar (all pages)

**Position:** Sticky top, z-50, height 64px (h-16)

### Left Section
- **Logo** — werewolf-ai-logo-2.png, 50x50px, wrapped in radial gradient circle
- **User name** — hidden on mobile (`hidden sm:inline`), shown when authenticated
- **Tier badge** — next to username, colored by tier:
  - Free: default border + secondary text
  - API: default border + secondary text
  - Paid: blue border + blue text

### Right Section — Desktop
- **Nav links:** "All games" | "Rules" | "User Profile" — pipe-separated, with hover color transition
- **ThemeSwitcher** — pill button with moon/sun SVG icon + "Light"/"Dark" label
- **AuthButtons:**
  - Unauthenticated: "Login" button → opens LoginDialog
  - Authenticated: "Logout" button → signs out

### Right Section — Mobile
- Same ThemeSwitcher and AuthButtons
- **Hamburger button** — toggles mobile dropdown menu (3-line / X icon)
- **Mobile dropdown** — absolute positioned below navbar, same nav links stacked vertically, closes on link click

---

## SHARED: Login Dialog (modal overlay)

**Trigger:** Login button in navbar, PlayNowButton on home, or `?login=true` URL param

### Overlay
- Fixed fullscreen, `bg-black/60 backdrop-blur-sm`
- Click backdrop to dismiss
- Escape key to dismiss
- Body scroll locked when open

### Modal Card
- `max-w-sm`, centered, rounded-xl, shadow-2xl
- Background: white (light) / neutral-900 (dark), themed border

### Controls
1. **Close button (X)** — top-right corner, SVG X icon
2. **Title:** "Sign In" (h2, bold, centered)
3. **Subtitle:** "Choose a provider to continue" (secondary text, centered)
4. **GitHub button** — full-width, GitHub SVG logo, "Continue with GitHub"
   - Action: `signIn('github', { callbackUrl })`
5. **Google button** — full-width, 4-color Google SVG logo, "Continue with Google"
   - Action: `signIn('google', { callbackUrl })`

Both buttons: neutral background, themed border, hover background change

---

## Screen: Home Page — `/`

**File:** `app/page.tsx`
**Rendering:** Server component (async, calls `auth()`)
**Auth:** Public — shows different CTA based on session

### Hero Section
- **Logo** — 144x144 (sm: 208x208), in radial gradient circle (`logo-backdrop`)
- **Title:** "Werewolf **AI**" — h1, `text-4xl sm:text-6xl font-extrabold`, "AI" uses `text-btn` color
- **Tagline 1:** "The ultimate social deduction game where you play against the world's best AI models." — `text-xl sm:text-2xl`, secondary color
- **Tagline 2:** "Put GPT, Claude, Gemini, DeepSeek, and others at the same table..." — `text-lg`, secondary color

### CTA Buttons (conditional)
- **If authenticated:** "Go to Game Lobby" — links to `/games`, large primary button (`px-8 py-4 bg-btn rounded-lg font-bold text-xl hover:scale-105 shadow-lg`)
- **If unauthenticated:** PlayNowButton — "Play Now (Sign In)" — opens LoginDialog with `/games` callback
- **Always:** "How to Play" — links to `/rules`, outlined button (`border-2 border-btn text-btn`)

### Features Section
- Container with subtle background (`bg-black/5 dark:bg-white/5 rounded-3xl`)
- **Title:** "Why Play Werewolf AI?" — h2, centered

3 feature cards in a grid (`grid-cols-1 md:grid-cols-3 gap-8`):

| Card | Icon | Color | Title | Description |
|------|------|-------|-------|-------------|
| 1 | Users/people SVG | blue-500 | "Immersive Werewolf Experience" | Custom themes, unique characters, voice acting... |
| 2 | Lightning bolt SVG | purple-500 | "All Top AI Models Together" | Mix GPT, Claude, Gemini, DeepSeek... |
| 3 | Shield check SVG | red-500 | "AI Intelligence Benchmark" | Test deduction, bluffing, reasoning... |

Each card: `p-6 rounded-xl theme-bg-card theme-border border shadow-sm`, icon in colored circle (`w-12 h-12 rounded-full`)

### Footer
- Horizontal links: About the Project, Privacy Policy, Terms of Service, GitHub
- Copyright: "© {year} AIWerewolf.net"
- Links: secondary text, hover to primary, `text-sm`

---

## Screen: Game List — `/games`

**File:** `app/games/page.tsx`
**Auth:** Required (redirects to login if not authenticated)

### Header Row
- **Title:** "Game List" — h1, `text-2xl font-bold`
- **"Create Game" button** — links to `/games/newgame`, `text-btn-text bg-btn hover:bg-btn-hover p-3 text-xl rounded`

### Tier Mismatch Warning (conditional)
- **Shown when:** `?error=tier_mismatch` query param present
- Yellow border/background banner
- Text: "You can only open games created on your current tier. Game {id} is locked."
- **"Dismiss" link** — links to `/games` (removes query params)

### Game List
- Scrollable `<ul>` with `space-y-4`
- **Empty state:** no explicit empty state in current code (just empty list)

### Per-Game Card
Each game is a `<li>` with `theme-bg-card theme-border border rounded-lg px-2 py-4 sm:px-4 theme-shadow`

**If same tier (clickable):**
- Entire card is a link to `/games/{id}`
- `hover:opacity-90`

**If different tier (locked):**
- `opacity-60`, `cursor-not-allowed`
- Warning text: "Switch back to the {TIER} tier to continue this game."

**Card content (GameListEntryContent):**
- **Row 1:** Theme name (h2, `text-lg capitalize font-semibold truncate`) + date (`text-xs`, formatted) + state badge (`Day {N} • {state}`, uppercase)
- **Row 2:** Description (`text-sm line-clamp-2 leading-relaxed`, secondary text)
- **Row 3:** Tier label (`text-[10px] uppercase tracking-wider`, 60% opacity)

**RemoveGame button (per card):**
- "X" button — right side of card
- **Click:** opens ConfirmModal: "Confirm Game Removal" / "Are you sure you want to remove this game? This action is permanent and cannot be undone."
  - **Cancel** — closes dialog
  - **Remove Game** — red button, calls `removeGame()` API, refreshes page

---

## Screen: Create New Game — `/games/newgame`

**File:** `app/games/newgame/page.tsx`
**Auth:** Required (redirects to sign-in)
**Rendering:** Client component

### Header Row
- **Title:** "Create New Game" — h1, `text-2xl font-bold text-white`
- **"Generate Preview" button** — `buttonBlackStyle`, disabled when form invalid or loading
  - Label changes: "Generate Preview" → "Generating Preview..." (with ⏳ spinner) → "Generate Preview Again" (after first generation)
- **"Create Game" button** — only shown after preview generated, `buttonBlackStyle`, disabled when loading
  - Label: "Create Game" / "Processing..."

### Configuration Form

1. **Name input** — half width, required
   - Placeholder: "Name *"
   - Style: `bg-black bg-opacity-30 text-white border border-white border-opacity-30`
   - Validation: letters and numbers only, no spaces
   - Error: red border + error text below
   - Default: random from [Bob, John, Alex, Sam, Max, Leo, Kai, Finn]

2. **Theme input** — half width, required
   - Placeholder: "Theme *"
   - Same style as name
   - Validation: non-empty
   - Error: red border + error text below
   - Default: random from [Lord of the Rings, Harry Potter, Hunger Games, Star Wars]

3. **Description textarea** — full width, optional
   - Placeholder: "Description (optional)"
   - Rows: 3

4. **Player Count dropdown** — half width
   - Label: "Player Count:"
   - Options: 6-12 (free tier) or 6-16 (API tier), format: "{N} players"
   - Default: 12

5. **Werewolf Count dropdown** — half width
   - Label: "Werewolf Count:"
   - Options: 0 to (playerCount - 1), format: "{N} werewolves"
   - Default: 3
   - Auto-adjusts if ≥ playerCount

6. **Players AI multi-select** — full width, required
   - Label: "Players AI *:"
   - Component: MultiSelectDropdown
   - Options: all AI models (excluding RANDOM)
   - Free tier: some models disabled with "(not available)" suffix, others show "(unlimited)" or "({N}x per game)"
   - Error: red text below when no models selected or insufficient capacity
   - Default: all available models selected
   - Disabled until tier loaded

7. **Special Roles checkboxes** — inline
   - Label: "Special Roles:"
   - 3 checkboxes: Doctor, Detective, Maniac (all checked by default)
   - Each has an **info button** (? circle) that shows/hides tooltip with role description on hover/click

### Loading Banner (conditional)
- Blue background, blue border
- ⏳ spinner + "Generating Game Preview..." title
- "The AI is creating your game story and characters. This may take a moment."

### Error Banner (conditional)
- Red background, red border
- ⚠️ icon + "Game Preview Generation Failed" title
- Error message text (user-friendly versions of common errors)

### Preview Section (after generation)

**Game Story:**
- Label: "Game Story:"
- Textarea, 5 rows, editable

**Game Master:**
- Voice Provider indicator: "Voice Provider: {name}" (text)
- **AI Model dropdown** — ModelSelectDropdown with tier-based availability
- **Voice dropdown** — select, filtered by gender (male voices for GM)
- **Play/Stop button** — 🔊 / ⏹️ emoji, 40x40, plays TTS preview of game story
  - Disabled when: no story text or already speaking
- **Voice Style input** (conditional) — only shown if `gameMasterVoiceStyle` exists, text input for style description

**Per-Bot Cards** (one per generated bot, typically 11):

Each card: `p-4 bg-gray-900 bg-opacity-50 rounded-lg`

- **Name input** — text, validation same as player name, red border on error
- **Gender dropdown** — options from GENDER_OPTIONS
- **Voice dropdown** — filtered by selected gender
- **Play/Stop button** — 🔊 / ⏹️, plays TTS preview of bot's story
- **AI Model dropdown** — ModelSelectDropdown, tier-aware with remaining capacity
- **Play Style dropdown** — options from PLAY_STYLES, formatted as title case
- **Play Style info button** (?) — shows tooltip with style name and description
- **Story textarea** — 3 rows, the bot's backstory
- **Voice Style input** (conditional) — only if `voiceStyle` exists

**Bottom Action Buttons (in preview section):**
- "Generate Preview Again" — `buttonTransparentStyle`, disabled when invalid/loading
- "Create Game" — `buttonTransparentStyle`, disabled when loading

---

## Screen: Profile — `/profile`

**File:** `app/profile/page.tsx`
**Auth:** Required
**Layout:** Two columns on desktop (`lg:flex-row`), single column on mobile

### Left Column (sticky on desktop)
- `lg:w-1/4 lg:sticky lg:top-20`

**User Info:**
- **Avatar** — 64x64, rounded-full, from session or fallback `/mememan.webp`
- **Name** — text
- **Email** — text
- **Tier** — "Tier: {TIER}" with color:
  - Free: yellow
  - API: green
  - Paid: blue (with opacity)

**Monthly Spendings** (below user info, separated by border-t):
- **SpendingsDisplay:** "Monthly Spendings" title
  - Last 5 months listed with month label + formatted currency amount

### Right Column

**Payment Success Banner (conditional):**
- Shown when `?payment=success` query param
- Green background/border: "Payment successful! Your balance has been updated."

**TierSwitcher (tabs):**
- 3 tab buttons: FREE (yellow), API (green), PAID (blue)
- Active tab: colored background + border-bottom
- "Current" badge on the tab matching user's actual tier
- `?tab=` query param sets initial active tab

**Tab Panels:**

#### Free Tab → FreeTierPanel
- Description of free tier limitations
- **Model limits table:** Model name | Max Bots/Game
  - Rows: all models, unavailable ones at `opacity-50`
  - Values: number, "Unlimited", or "Not available"
- **"Switch to Free Tier" button** — only when not on free tier
  - Label: "Switch to Free Tier" / "Switching..."
  - Reloads page on success

#### API Tab → ApiTierPanel
- **"Switch to API Tier" button** — only when not on API tier
  - Label: "Switch to API Tier" / "Switching..."
  - Reloads page on success
- **ApiKeyList:**
  - Empty state: "No API keys configured yet."
  - Key list: each key shows provider name, masked value, edit (pencil) and delete (trash) icons
  - **"+ Add API Key" button** — only when there are providers without keys
  - **Edit/Add Modal:**
    - Provider select (add mode only)
    - API Key text input (placeholder: "Paste your API key here...", autofocus)
    - Cancel / Save|Add buttons (Add disabled when fields empty)

#### Paid Tab → PaidTierPanel
- **"Switch to Paid Tier" button** — only when not on paid tier
- **Balance display:** formatted currency in green
- **Markup info:** "{N}% markup" info box
- **Credit package buttons** — one per package (e.g. "$10", "$50"), redirects to Stripe checkout
  - Label: package label / "Redirecting..." during purchase
  - All disabled during any purchase

**Common Sections (below tabs):**

**ModelPricingTable:**
- Title: "Model Pricing"
- Table: Model | Input Cost* | Output Cost*
- All models listed with per-million-token pricing
- Footer: "* Per million tokens (extended context rates shown when available)"

**VoiceInfoSection:**
- Title: "Voice Models (TTS/STT)"
- Info about requirements (OpenAI key), TTS model + cost, STT model + cost

---

## Screen: Rules — `/rules`

**File:** `app/rules/page.tsx`
**Auth:** Required

All content in themed cards (`theme-bg-card theme-border border rounded-lg p-6 theme-shadow mb-6`)

### Sections

1. **Title:** "How to Play" — h1, `text-3xl font-bold`

2. **Overview card:**
   - h2: "Overview"
   - Description paragraph about the game

3. **Roles card:**
   - h2: "Roles"
   - Dynamic list from `ROLE_CONFIGS`, each role shows:
     - Role name (h3, `text-lg font-semibold`)
     - Alignment badge: "Village Team" (green) or "Werewolf Team" (red) — `text-xs px-2 py-0.5 rounded-full`
     - Description paragraph
     - Night action note (italic, if applicable): "Has a night action (priority: {N})"
   - Roles separated by `border-b`

4. **Game Phases card:**
   - h2: "Game Phases"
   - Intro text about day/night cycle
   - 3 sub-sections:
     - "1. Day Discussion" — description
     - "2. Voting" — description
     - "3. Night" — numbered list (ol) of role actions in order: Maniac → Werewolves → Doctor → Detective, each with bold role name and detailed description

5. **Win Conditions card:**
   - h2: "Win Conditions"
   - "Village Team Wins" (h3, green text) + condition
   - "Werewolf Team Wins" (h3, red text) + condition

6. **Play Styles card:**
   - h2: "Play Styles"
   - Intro text
   - Grid (`grid-cols-1 md:grid-cols-2 gap-3`) of play style cards from `PLAY_STYLE_CONFIGS`
   - Each: bordered card with style name (h3, `font-semibold text-sm`) and description (`text-xs`)

### Controls: None (display only)

---

## Screen: About — `/about`

**File:** `app/about/page.tsx`
**Auth:** Public

### Header
- **Logo** — 128x128, centered
- **Title:** "About Werewolf AI" — h1, `text-4xl font-extrabold`
- **Subtitle:** "Can LLMs truly play Werewolf at a human level?" — `text-xl`, secondary, centered

### Content Sections

1. **"The Question"** — h2 with underline decoration (`underline decoration-btn decoration-4 underline-offset-8`)
   - Two paragraphs about the project's origin

2. **Two-column card grid** (`grid-cols-1 md:grid-cols-2 gap-8`):
   - "AI as Players" card — `p-6 rounded-2xl theme-bg-card theme-border border shadow-sm`
   - "AI as Benchmark" card — same style

3. **"The Challenge"** — h2 with same underline style
   - Two paragraphs about technical challenges

4. **"What We Found"** — h2 with same underline style
   - Two paragraphs about results

### Footer
- Border-top separator
- **"← Back to Home" link** — links to `/`
- **Credit:** "Created by hiper2d" (italic, right-aligned)

### Controls: None (display only, except back link)

---

## Screen: Privacy Policy — `/privacy`

**File:** `app/privacy/page.tsx`
**Auth:** Public

### Content
- **Title:** "Privacy Policy" — h1, `text-3xl font-bold`
- **Last updated:** dynamic date, italic, 70% opacity
- **Sections** (each with h2 using `underline decoration-btn/40 underline-offset-4`):
  - Introduction
  - What I Collect (bulleted list)
  - Third-Party Services (bulleted list with external links to Stripe privacy)
  - What I Don't Do (bulleted list)
  - Cookies
  - Contact (GitHub link)
- **"← Back to Home" link** — bottom, with border-top separator

### Controls: None (display only, except links)

---

## Screen: Terms of Service — `/terms`

**File:** `app/terms/page.tsx`
**Auth:** Public

### Content
- **Title:** "Terms of Service" — h1, `text-3xl font-bold`
- **Last updated:** dynamic date, italic, 70% opacity
- **Sections** (same heading style as privacy):
  - General Terms
  - Usage Restrictions (bulleted list)
  - No Responsibility for AI Content
  - Modification of Terms
- **"← Back to Home" link** — bottom, with border-top separator

### Controls: None (display only, except back link)

---

## MODALS REFERENCE (all screens)

| Modal | Trigger | Screen | Controls |
|-------|---------|--------|----------|
| LoginDialog | Login button, PlayNowButton, URL param | All (via layout) | GitHub OAuth, Google OAuth, Close |
| VotingModal | Human's turn in vote queue | Game | Player select, reason textarea, Cancel, Cast Vote |
| NightActionModal | Human's turn for night action | Game | Target select, action type radios (Doctor/Detective), narrative textarea, Cancel, Submit |
| BotSelectionDialog | "Select Bots Manually" button | Game | Bot checkboxes with order numbers, Cancel, Confirm |
| ModelSelectionDialog | Click bot's AI model name | Game | Model dropdown, Cancel, Update Model |
| ConfirmModal | Delete message actions, RemoveGame | Game, Game List | Message, Cancel, Confirm (red) |
| ApiKeyList modal | Add/Edit API key | Profile | Provider select (add), key input, Cancel, Save/Add |
| RemoveGame confirm | X button on game card | Game List | Message, Cancel, Remove Game (red) |
