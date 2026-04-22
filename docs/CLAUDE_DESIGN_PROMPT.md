# Prompt for Claude Design

## What This Is

I'm redesigning my **AI Werewolf Party Game** (aiwwerewolf.net). It's a Next.js web app where one human plays the Werewolf social deduction game alongside 5-15 AI bots (GPT, Claude, Gemini, DeepSeek, Grok, etc.). Each bot has a secret role, unique personality, play style, and voice. Games run in day/night cycles — players discuss, accuse, vote to eliminate, and use special abilities at night.

I want a **full visual redesign** of every screen in a **campfire pixel art** style. The attached screenshots show the current look (clean/corporate with glassmorphism). I want to replace it with something that feels like a game, not a dashboard.

## Creative Direction: Campfire Pixel Art

**The core metaphor:** characters gathered around a campfire in a dark forest at night, telling stories and pointing fingers. The werewolf theme should feel atmospheric and immersive, not corporate.

### Visual Language
- **Pixel art style** — chunky, 16-bit inspired. Characters, fire, environment are pixel art
- **Dark atmospheric palette** — deep navy/charcoal base, warm fire tones (amber, orange, ember red), cool moonlight accents (steel blue, silver)
- **Campfire as centerpiece** — the animated fire anchors the game screen
- **Character sprites** — each player is a distinct pixel art character (~32-48px). Different silhouettes via hats, hair, accessories. States: idle, speaking (glow), dead (ghost/greyed)
- **Day/night mood** — the scene subtly shifts: warmer/brighter during day discussion, darker/moodier during night phase, tense during voting
- **Retro game UI** — bordered panels, maybe parchment textures for chat, inventory-style roster, pixel art icons

### Typography
- **Pixel font** for headings, labels, UI chrome (Press Start 2P, Silkscreen, or similar)
- **Clean sans-serif** for chat messages and long text (Inter, system font). Chat readability is non-negotiable — AI bots write multi-paragraph messages

### Color Palette Direction
- **Background:** deep charcoal/navy (#0a0a12 to #1a1a2e range)
- **Fire accent:** amber → orange → ember red gradient
- **Moonlight accent:** steel blue, silver
- **Player colors:** need 16 distinct, saturated colors that pop against the dark background
- **UI surfaces:** dark panels with warm-tinted borders
- **Text:** warm off-white for primary, muted grey for secondary
- **Danger/warning:** keep red, yellow, green for semantic colors but pixel-art-ify them

---

## Screens to Design

Design every screen as a **standalone HTML page** with inline CSS. Use placeholder pixel art (colored rectangles with labels are fine — I'll replace with real sprites later). Each screen should be fully specified: colors, spacing, typography, borders, all states.

---

### Screen 1: Game Page — `/games/[id]` (MOST IMPORTANT)

This is 90% of the user experience. Get this right first.

**Layout:**
```
┌──────────────────────────────────────────────────┐
│  NAVBAR (compact, sticky)                        │
├──────────────────────────────────────────────────┤
│                                                  │
│  CAMPFIRE SCENE (top ~40vh)                      │
│                                                  │
│      [sprite] [sprite] [sprite]                  │
│   [sprite]                [sprite]               │
│      [sprite]   🔥    [sprite]                   │
│   [sprite]                [sprite]               │
│      [sprite] [sprite] [sprite]                  │
│                                                  │
│   Day 1 · Discussion        ⚙️ Settings          │
│                                                  │
│  ─── draggable divider ─────────────────────     │
│                                                  │
│  CHAT PANEL (bottom ~60vh, scrollable)           │
│  ┌─────────────────────────────────────────────┐ │
│  │ Game Master: The village wakes to find...   │ │
│  │ Harry: I noticed something strange...       │ │
│  │ Hermione: That's baseless, Harry...         │ │
│  │ ... (scrollable)                            │ │
│  ├─────────────────────────────────────────────┤ │
│  │ [input field..................] [Send]       │ │
│  │ [Vote] [Keep Going] [Start Night]           │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**Campfire scene requirements:**
- 6-16 character sprites arranged in a circle/oval around a central fire
- Each sprite has a **name label** below it
- **Speaking character:** glows, fire sparks toward them, or bounces
- **Dead character:** greyed out, ghost overlay, or slumped. Still visible but clearly dead
- **Your character (human player):** distinguished somehow — brighter outline, "YOU" label, or a different seat
- **Game Master:** stands apart or has a unique position (maybe center/above fire, narrator position)
- **Hover a sprite:** tooltip with name, role (if known), AI model, alive/dead status
- **Click a sprite:** highlight that player's messages in the chat below

**Phase-specific scene changes:**
- **Day Discussion:** warm lighting, characters animated, fire bright
- **Voting:** characters point at their vote target (or vote counts appear above heads as pixel numbers)
- **Night:** scene darkens dramatically, fire dims to embers, only active characters visible (werewolves' eyes glow red)
- **Night Results:** dawn breaking, casualties revealed with death animation
- **Game Over:** victorious team celebrates, losers slumped

**Chat panel requirements:**
- Player name in their assigned color, bold, before each message
- Messages can be very long (5+ paragraphs from AI) — must be comfortable to read
- Game Master messages should look distinct (different background tint or border)
- System messages (phase changes, vote results, death announcements) styled differently from player chat
- Day selector tabs if game has multiple days
- Message count indicator
- Scroll-to-bottom button when not at bottom

**Action buttons (contextual):**
- During Discussion: `[Vote]` `[Keep Going]` `[Select Bots]` `[Cancel]`
- During Voting: voting UI (could integrate with campfire — click sprite to vote?)
- During Night: `[Perform Night Action]` (role-specific)
- After Night: `[Next Day]`
- Game Over: `[Post-Game Chat]` `[Back to Games]`

**Queue/progress indicator:**
- Shows who's about to speak next (currently a right sidebar list)
- Could be: a progress bar, or highlights on the campfire sprites showing the speaking order
- "3 of 11 bots introduced" type progress text

---

### Screen 2: Home Page — `/`

**Sections:**
1. **Hero:** large pixel art campfire scene or dark forest, game title in pixel font, tagline "The ultimate social deduction game where you play against the world's best AI models", CTA button "Play Now" / "Go to Game Lobby"
2. **Features:** 3 cards — "Immersive Werewolf Experience" (custom themes, characters, voice), "All Top AI Models Together" (GPT, Claude, Gemini, etc.), "AI Intelligence Benchmark" (test deduction, bluffing, reasoning). Each card could have a pixel art icon
3. **Footer:** links to /about, /privacy, /terms, GitHub. Copyright

**Feel:** atmospheric landing page that makes you want to play. Dark, moody, the fire draws you in.

---

### Screen 3: Game List — `/games`

- Page title "Game List" with "Create Game" button
- List of game cards, each showing:
  - Game theme name (e.g. "Harry Potter")
  - Creation date
  - Current state (Day 1 · Discussion, Day 3 · Voting, Game Over)
  - Tier badge (Free/API/Paid)
  - Delete button (X)
- Could each card have a tiny campfire scene thumbnail or pixel art icon for the theme
- Tier mismatch warning banner (yellow) when applicable
- Empty state when no games exist

---

### Screen 4: Create New Game — `/games/newgame`

This is a complex form. Two phases: configuration, then preview.

**Phase 1 — Configuration form:**
- Player name input
- Theme input (e.g. "Harry Potter", "Star Wars")
- Description textarea (optional)
- Player count dropdown (6-16)
- Werewolf count dropdown
- AI models multi-select dropdown (all models listed with availability per tier)
- Special roles checkboxes: Doctor, Detective, Maniac (each with info tooltip explaining the role)
- "Generate Preview" button

**Phase 2 — Preview (after AI generates):**
- Game Story textarea (editable, the AI-written narrative)
- Game Master section: AI model dropdown, voice dropdown, play button to preview voice
- Per-bot cards (11+ of them), each containing:
  - Name input
  - Gender dropdown
  - Voice dropdown + play button
  - AI model dropdown
  - Play style dropdown + info tooltip
  - Story textarea (the bot's backstory)
  - Voice style input (optional)
- "Generate Preview Again" and "Create Game" buttons

**Design challenge:** lots of form inputs. Make it feel like configuring a game session, not filling out a tax form. Maybe a "character creation" RPG feel?

---

### Screen 5: Profile — `/profile`

**Left column (sticky):**
- User avatar, name, email
- Tier badge (Free/API/Paid) with color
- Monthly spendings chart/display

**Right column:**
- Tier switcher tabs (Free | API | Paid)
  - Free panel: limitations, available models
  - API panel: API key management (add/remove keys per provider), key list with masked values
  - Paid panel: balance display, top-up button (Stripe)
- Model pricing table (all AI models with cost per game)
- Voice configuration section

---

### Screen 6: Rules — `/rules`

Content page with sections:
- Overview (what the game is)
- Roles (Villager, Werewolf, Doctor, Detective, Maniac) with alignment badges (Village Team / Werewolf Team)
- Game Phases (Day Discussion, Voting, Night) with detailed descriptions
- Win Conditions (Village wins / Werewolves win)
- Play Styles grid (balanced, aggressive, cautious, etc.)

**Pixel art opportunity:** role icons (stethoscope for Doctor, magnifying glass for Detective, etc.)

---

### Screen 7: About — `/about`

Content page:
- Logo + title
- "The Question" — can LLMs play social deduction games?
- 2-column card section: "AI as Players" / "AI as Benchmark"
- "The Challenge" — making AI follow rules AND be fun
- "What We Found" — results and observations

---

### Screen 8: Login Dialog (modal overlay)

- Dark overlay with blur
- Modal card: "Sign In" title, "Choose a provider" subtitle
- GitHub OAuth button with GitHub logo
- Google OAuth button with Google logo
- Close button (X)

Should feel like a game menu overlay, not a corporate login page.

---

### Screen 9: Privacy Policy — `/privacy`

Minimal styling. Long-form legal text with section headings. Just needs to be readable against the dark background with the pixel art UI chrome.

---

### Screen 10: Terms of Service — `/terms`

Same treatment as Privacy — readable legal text with consistent styling.

---

## Game Modals to Design

These appear as overlays during gameplay:

### VotingModal
- Shows all alive players
- Player selects one to vote for elimination
- **Idea:** could this integrate with the campfire? Click a sprite to cast your vote? Or a modal with player portraits as pixel art?

### NightActionModal
- Role-specific actions:
  - **Doctor:** choose a player to heal (or one-time kill ability)
  - **Detective:** choose a player to investigate (or one-time kill ability)
  - **Maniac:** choose a player to abduct
  - **Werewolf:** choose a player to attack (with private werewolf chat)
- Show player list with action buttons

### ConfirmModal
- Generic "Are you sure?" with Yes/No buttons

### BotSelectionDialog
- Checkbox list of bots to select which ones respond next
- Confirm/Cancel buttons

### ModelSelectionDialog
- Current bot name and model
- Dropdown to select new AI model
- Confirm/Cancel buttons

---

## Shared Components to Design

### Navbar
- Logo (pixel art werewolf or campfire icon), user name + tier badge
- Nav links: All Games | Rules | Profile
- Theme toggle (dark/light — though dark is primary)
- Login/Logout button
- Mobile: hamburger menu

### Button
- **Primary:** solid, warm accent color (fire-toned)
- **Ghost/Transparent:** outlined, subtle background on hover
- **Destructive:** red-toned for dangerous actions
- **Disabled:** greyed out, no hover effect
- All should have a pixel-art feel (maybe 2px borders, no rounded corners or very minimal)

### Input / Select / Textarea
- Dark background, warm-tinted border
- Focus state: fire accent border glow
- Error state: red border
- Placeholder text in muted color

### Card
- Dark surface with subtle border
- Maybe a pixel art corner decoration or border pattern

### Badge / Tag
- Small pill or rectangular label
- Used for: tier (Free/API/Paid), role alignment (Village/Werewolf), game state

### Alert / Banner
- **Error:** red-toned background/border
- **Warning:** yellow/amber-toned
- **Success:** green-toned
- **Info:** blue-toned
- Consistent component, not 4 different ad-hoc styles

### Tabs
- Used in profile page tier switcher
- Active tab clearly distinguished

---

## Responsive Design

### Desktop (1024px+)
- Full campfire scene, full chat panel
- Side-by-side layouts where applicable (profile page)

### Tablet (768-1023px)
- Campfire scene slightly compressed
- Single column layouts

### Mobile (< 768px)
- **Game page:** campfire becomes a compact strip (~100-120px) showing character circles/mini-sprites in a horizontal row. Chat fills remaining space
- **Navbar:** hamburger menu
- **Forms:** stack to single column
- **Modals:** full-screen or bottom sheet

---

## Pixel Art Asset Specifications

I'll commission or generate these separately. Define:
- **Campfire:** ~64x64px, 3-4 frame animation loop (sprite sheet)
- **Character sprites:** ~32x48px each, need: idle, speaking, dead states. 16 distinct characters differentiated by: hat shape, hair style, accessory (glasses, scarf, beard, etc.), body color
- **Environment:** dark forest backdrop, logs/stumps for seats, optional moon, stars, trees
- **Icons:** ~16x16 or 24x24px pixel art — vote (ballot), night (moon), day (sun), death (skull), heal (heart/cross), investigate (magnifying glass), chat (speech bubble), settings (gear)
- **Phase banners:** "DAY 1", "NIGHT", "VOTING", "GAME OVER" in pixel font with themed frames

For this prototype, use **colored placeholder rectangles** with labels. Mark dimensions and state variants so I know what to produce.

---

## Technical Constraints

- **Built with:** React, Next.js, Tailwind CSS
- **Theme:** dark is primary, light is optional/secondary
- **Performance:** pixel art sprites should be small PNGs or CSS sprites. Fire animation via CSS or sprite sheet, not canvas/WebGL
- **Chat readability:** the #1 priority. Long messages must be easy to read. Don't sacrifice this for aesthetics
- **Player colors:** 16 distinct colors against dark backgrounds. Must be clearly distinguishable in both the campfire sprite labels and chat message names
- **Production-ready:** every design must be specified precisely enough for a developer to implement in Tailwind/CSS. Include: hex colors, pixel sizes, font sizes, spacing values, border widths

---

## Attached Materials

**Paste these spec docs into the conversation:**
- `docs/SPEC_ROUTES.md` — every route with data, mutations, UI sections
- `docs/SPEC_COMPONENTS.md` — every component with props, usage counts
- `docs/SPEC_TOKENS.md` — current colors, typography, spacing, icons, styling stack

**Upload these screenshots** (the current UI to be replaced):
- `home-dark.png`, `home-light.png`
- `game-chat-dark.png`, `game-chat-light.png`
- `games-dark.png`, `games-light.png`
- `newgame-dark.png`, `newgame-light.png`
- `profile-dark.png`, `profile-light.png`
- `rules-dark.png`, `rules-light.png`
- `about-dark.png`, `about-light.png`
- `login-dialog-dark.png`
- `privacy-dark.png`, `terms-dark.png`

---

## Output I Need

For each screen, produce a **standalone HTML file** with inline CSS that I can open in a browser. Include:
1. Full visual design with all elements positioned
2. All interactive states noted (hover, active, disabled, error)
3. All responsive breakpoints shown or noted
4. Color values, font sizes, spacing — everything a developer needs
5. Notes on pixel art placeholders: what asset goes where, what size, what states

After all screens: produce a **COMPONENT_MAP.md** mapping old components to new ones.
