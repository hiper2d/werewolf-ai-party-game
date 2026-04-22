# Route Specification — Werewolf AI Party Game

## Marketing / Public

---

### Route: /
**File:** `werewolf-client/app/page.tsx`
**Rendering:** server (async component, calls `auth()`)
**Auth:** public (shows different CTA based on session)
**Data fetched:**
  - `session` from `auth()` — determines logged-in state
**Mutations / actions:** None
**UI sections on this page:**
  - Hero: logo (logo-backdrop circle), title "Werewolf AI", tagline, CTA buttons
  - Features: 3-card grid ("Immersive Werewolf Experience", "All Top AI Models Together", "AI Intelligence Benchmark")
  - Footer: links to /about, /privacy, /terms, GitHub
**Query params / state:**
  - `?login=true&callbackUrl=...` — triggers login dialog (handled by LoginDialogProvider in layout)
**Navigation edges:**
  - Exits to: /games (if authenticated), /rules, /about, /privacy, /terms

---

### Route: /about
**File:** `werewolf-client/app/about/page.tsx`
**Rendering:** server (default, no data fetching)
**Auth:** public
**Data fetched:** None
**Mutations / actions:** None
**UI sections on this page:**
  - Logo + title
  - Long-form content sections: "The Question", "AI as Players / AI as Benchmark" (2-col card grid), "The Challenge", "What We Found"
  - Back-to-home link + credit
**Navigation edges:**
  - Entered from: / (footer)
  - Exits to: / (back link)

---

### Route: /privacy
**File:** `werewolf-client/app/privacy/page.tsx`
**Rendering:** server (static content)
**Auth:** public
**Data fetched:** None
**Mutations / actions:** None
**UI sections on this page:**
  - Long-form legal text with underlined section headings (decoration-btn)
  - Sections: Introduction, What I Collect, Third-Party Services, What I Don't Do, Cookies, Contact
  - Back-to-home link
**Navigation edges:**
  - Entered from: / (footer)
  - Exits to: /

---

### Route: /terms
**File:** `werewolf-client/app/terms/page.tsx`
**Rendering:** server (static content)
**Auth:** public
**Data fetched:** None
**Mutations / actions:** None
**UI sections on this page:**
  - Long-form legal text, same heading style as /privacy
  - Sections: General Terms, Usage Restrictions, No Responsibility for AI Content, Modification of Terms
  - Back-to-home link
**Navigation edges:**
  - Entered from: / (footer)
  - Exits to: /

---

## Auth

Authentication is handled by NextAuth with GitHub + Google OAuth providers.

### Route: /api/auth/[...nextauth]
**File:** `werewolf-client/app/api/auth/[...nextauth]/route.ts`
**Rendering:** API route
**Auth:** NextAuth handler
**Notes:** Catch-all NextAuth route. Login UI is a modal (`LoginDialog` component in root layout), not a separate page.

---

## Games

---

### Route: /games
**File:** `werewolf-client/app/games/page.tsx`
**Rendering:** server (async component)
**Auth:** required (redirects to `/?login=true` if unauthenticated)
**Data fetched:**
  - `session` from `auth()`
  - `userTier` from `getUserTier(userEmail)` — determines which games are accessible
  - `games: Game[]` from `getAllGames(userEmail)` — user's game list
**Mutations / actions:** None on this page (RemoveGame component handles deletion)
**UI sections on this page:**
  - Header: "Game List" title + "Create Game" button (links to /games/newgame)
  - Tier mismatch warning banner (conditional, from `?error=tier_mismatch`)
  - Game list: scrollable `<ul>` of game cards showing theme, date, day/state, description, tier badge
  - Each card: links to `/games/[id]`, disabled if tier mismatched
  - RemoveGame button per card
**Query params / state:**
  - `?error=tier_mismatch&blocked=[gameId]` — shows warning banner
**Navigation edges:**
  - Entered from: / (hero CTA), navbar
  - Exits to: /games/[id], /games/newgame

---

### Route: /games/newgame
**File:** `werewolf-client/app/games/newgame/page.tsx`
**Rendering:** client (`'use client'`)
**Auth:** required (redirects to /api/auth/signin if unauthenticated)
**Data fetched:**
  - `session` from `useSession()`
  - `userTier` from `GET /api/user-tier` (client-side fetch)
**Mutations / actions:**
  - `previewGame(gamePreviewData)` — server action, generates AI preview with bots
  - `createGame(gameData)` — server action, creates game in Firestore
  - `ttsService.speakText(...)` — client-side TTS playback for story/voice preview
**UI sections on this page:**
  - Header: "Create New Game" + Generate Preview / Create Game buttons
  - Form: name input, theme input, description textarea, player count dropdown, werewolf count dropdown, AI model multi-select, special roles checkboxes (Doctor/Detective/Maniac) with info tooltips
  - Loading state: blue info banner with spinner
  - Error state: red error banner
  - Preview section (after generation): game story textarea, Game Master config (AI model, voice, voice style), player cards (name, gender, voice, AI model, play style with tooltip, story, voice style)
  - Bottom action buttons: Generate Preview Again, Create Game
**Query params / state:** None
**Navigation edges:**
  - Entered from: /games ("Create Game" button)
  - Exits to: /games (after creation)

---

### Route: /games/[id]
**File:** `werewolf-client/app/games/[id]/page.tsx` (server wrapper) + `werewolf-client/app/games/[id]/GamePage.tsx` (client component)
**Rendering:** server page wrapping client component
**Auth:** required (redirects if unauthenticated; redirects if not game owner; redirects if tier mismatch)
**Data fetched:**
  - `session` from `auth()`
  - `game` from `getGame(params.id)` — full game object from Firestore
  - `userTier` from `getUserTier(session.user.email)`
**Mutations / actions:**
  - `welcome()` — starts game (sends welcome message from GM)
  - `vote()` — triggers voting phase
  - `keepBotsGoing()` — makes bots continue chatting
  - `manualSelectBots()` — manually pick which bots respond
  - `cancelBotResponses()` — cancel pending bot responses
  - `afterGameDiscussion()` — starts post-game chat
  - `startNewDay()` — advances to next day after night
  - `summarizePastDay()` — GM summarizes the day
  - `replayNight()` / `performNightAction()` — night phase actions
  - `updateBotModel()` / `updateGameMasterModel()` — change AI models mid-game
  - `clearGameErrorState()` / `setGameErrorState()` — error management
**UI sections on this page:**
  - 3-panel layout: left sidebar (player roster), center (chat), right sidebar (game status)
  - Mobile: panel overlays triggered by buttons
  - GameChat: message list with player colors, input area, action buttons
  - VotingModal: vote selection during day voting
  - NightActionModal: role-specific night actions (heal/investigate/abduct)
  - ConfirmModal: generic confirmation dialog
  - ModelSelectionDialog: change AI model for a bot
  - BotSelectionDialog: select which bots respond next
  - MentionDropdown: autocomplete for @mentions in chat
  - DraggableDialog: draggable window container for dialogs
**Query params / state:** None
**Navigation edges:**
  - Entered from: /games (game list click)
  - Exits to: /games (via navbar)

---

### Route: /games/[id] (error boundary)
**File:** `werewolf-client/app/games/[id]/error.tsx`
**Rendering:** client (error boundary)
**Auth:** inherits from parent
**Notes:** Catches runtime errors in game page, shows error message with retry button.

---

## Profile

---

### Route: /profile
**File:** `werewolf-client/app/profile/page.tsx`
**Rendering:** server (async component)
**Auth:** required (redirects to `/?login=true`)
**Data fetched:**
  - `session` from `auth()`
  - `user` from `getUser(email)` — full user record
  - `apiKeys` from `getUserApiKeys(email)` — user's API keys
  - `userTier` derived from `user.tier`
  - `balance` from `user.balance`
**Mutations / actions:** None on page level (child components handle mutations)
**UI sections on this page:**
  - Left column (sticky on lg): user info (avatar, name, email, tier badge), monthly spendings chart
  - Right column: payment success banner (conditional), TierSwitcher tabs (Free/API/Paid panels), ModelPricingTable, VoiceInfoSection
**Query params / state:**
  - `?tab=free|api|paid` — sets initial tab in TierSwitcher
  - `?payment=success` — shows success banner
**Navigation edges:**
  - Entered from: navbar
  - Exits to: (via navbar)

---

## API Routes

---

### Route: /api/games/[id]/messages
**File:** `werewolf-client/app/api/games/[id]/messages/route.ts`
**Method:** GET
**Auth:** unknown — needs confirmation
**Purpose:** Fetches messages for a game

### Route: /api/games/[id]/messages/delete-after
**File:** `werewolf-client/app/api/games/[id]/messages/delete-after/route.ts`
**Method:** DELETE (assumed)
**Auth:** unknown — needs confirmation
**Purpose:** Deletes messages after a certain point

### Route: /api/games/[id]/messages/delete-after-excluding
**File:** `werewolf-client/app/api/games/[id]/messages/delete-after-excluding/route.ts`
**Method:** DELETE (assumed)
**Auth:** unknown — needs confirmation
**Purpose:** Conditional message deletion excluding certain messages

### Route: /api/user-tier
**File:** `werewolf-client/app/api/user-tier/route.ts`
**Method:** GET
**Auth:** requires session
**Purpose:** Returns current user's tier

### Route: /api/webhooks/stripe
**File:** `werewolf-client/app/api/webhooks/stripe/route.ts`
**Method:** POST
**Auth:** Stripe webhook signature verification
**Purpose:** Handles Stripe payment webhooks

---

## Summary

| Area | Routes |
|------|--------|
| Marketing / Public | 4 (/, /about, /privacy, /terms) |
| Auth | 1 API route (NextAuth catch-all) |
| Games | 3 pages + 1 error boundary (/games, /games/newgame, /games/[id]) |
| Profile | 1 (/profile) |
| API | 5 routes |
| **Total pages** | **9** |
| **Total API routes** | **6** |
