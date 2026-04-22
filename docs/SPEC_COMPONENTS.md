# Component Specification — Werewolf AI Party Game

## Shared Components (root `/components/`)

---

### NavBar
**File:** `werewolf-client/components/navbar.tsx`
**Props:** None (reads session via `useSession()`)
**Built on:** next/image, next/link, next-auth/react
**Used in:** 1 place — `app/layout.tsx`
**Behavior:**
  - Sticky header (`sticky top-0 z-50`)
  - Desktop: logo, user name + tier badge, nav links (All games | Rules | User Profile), ThemeSwitcher, AuthButtons
  - Mobile: hamburger menu toggles dropdown overlay
  - Fetches `userTier` via `getUserTier()` on mount
**Visual notes:** `.navbar-root` class, `logo-backdrop-sm` circle, nav-link/nav-divider classes, h-16

---

### LoginDialog
**File:** `werewolf-client/components/login-dialog.tsx`
**Props:** None (reads state from `useLoginDialog()`)
**Built on:** next-auth/react `signIn()`
**Used in:** 1 place — `app/layout.tsx`
**Behavior:**
  - Fixed overlay with `bg-black/60 backdrop-blur-sm`
  - Modal card: `max-w-sm rounded-xl shadow-2xl`
  - Close on backdrop click or Escape key
  - Locks body scroll when open
  - Two OAuth buttons: GitHub (SVG logo), Google (colored SVG logo)
**Visual notes:** `bg-white dark:bg-neutral-900`, border theme-border

---

### AuthButtons
**File:** `werewolf-client/components/auth-buttons.tsx`
**Props:** None
**Built on:** next-auth/react, LoginDialogProvider
**Used in:** 1 place — `components/navbar.tsx`
**Behavior:** Shows "Login" or "Logout" button depending on session state
**Visual notes:** Uses `buttonTransparentStyle` from constants

---

### AuthProvider
**File:** `werewolf-client/components/auth-provider.tsx`
**Props:** `{ children: ReactNode }`
**Built on:** next-auth/react `SessionProvider`
**Used in:** 1 place — `app/layout.tsx`
**Notes:** Thin wrapper around NextAuth's SessionProvider

---

## App-Level Components (`/app/components/`)

---

### ThemeSwitcher
**File:** `werewolf-client/app/components/ThemeSwitcher.tsx`
**Props:** None
**Built on:** ThemeProvider context
**Used in:** 1 place — `components/navbar.tsx`
**Behavior:** Toggle button showing moon (light) or sun (dark) icon + theme name
**Visual notes:** `.theme-toggle` class (pill shape, border, transition)

---

### MultiSelectDropdown
**File:** `werewolf-client/app/components/MultiSelectDropdown.tsx`
**Props:** `{ options, selectedOptions, onChange, placeholder, className, hasError, disabled, labelFn, optionMetaFn }`
**Built on:** Custom (no library)
**Used in:** 1 place — `app/games/newgame/page.tsx`
**Behavior:** Multi-select with checkboxes, optional disabled items with suffixes
**Visual notes:** Dark input style (`bg-black bg-opacity-30`)

---

### ModelSelectDropdown
**File:** `werewolf-client/app/components/ModelSelectDropdown.tsx`
**Props:** `{ options: {model, disabled, label, displayLabel}[], value, onChange, className }`
**Built on:** Custom
**Used in:** 2+ places — `app/games/newgame/page.tsx`, `app/games/[id]/components/ModelSelectionDialog.tsx`
**Behavior:** Single-select dropdown for AI model selection with disabled options
**Visual notes:** Dark input style

---

### PlayNowButton
**File:** `werewolf-client/app/components/PlayNowButton.tsx`
**Props:** None
**Built on:** LoginDialogProvider
**Used in:** 1 place — `app/page.tsx`
**Behavior:** CTA button that opens login dialog for unauthenticated users
**Visual notes:** Large primary button style (px-8 py-4 bg-btn rounded-lg font-bold text-xl)

---

## Game Components (`/app/games/[id]/components/`)

---

### GameChat
**File:** `werewolf-client/app/games/[id]/components/GameChat.tsx`
**Props:** `{ game, participants, messages, pendingMessages, onSendMessage, onVote, ... }` (complex — many callback props)
**Built on:** Custom, refs, scroll management
**Used in:** 1 place — `app/games/[id]/GamePage.tsx`
**Behavior:**
  - Main chat interface: message list with player-colored names
  - Input area with mention autocomplete
  - Action buttons bar (Keep Going, Vote, Night Action, etc.)
  - Error banners (warning/error states)
  - Integrates VotingModal, NightActionModal, ConfirmModal
**Visual notes:** Player colors from `color-utils.ts`, scrollable message area, dark semi-transparent backgrounds

---

### VotingModal
**File:** `werewolf-client/app/games/[id]/components/VotingModal.tsx`
**Props:** `{ players, onVote, onClose }`
**Built on:** Custom modal
**Used in:** 1 place — `GameChat.tsx`
**Behavior:** Shows alive players, user selects one to vote for elimination
**Visual notes:** Uses `buttonTransparentStyle`, `buttonBlackStyle`

---

### NightActionModal
**File:** `werewolf-client/app/games/[id]/components/NightActionModal.tsx`
**Props:** `{ game, humanPlayer, onAction, onClose }`
**Built on:** Custom modal
**Used in:** 1 place — `GameChat.tsx`
**Behavior:** Role-specific night actions (Doctor: heal/kill, Detective: investigate/kill, Maniac: abduct, Werewolf: attack)
**Visual notes:** Uses theme-bg-card, role-specific color accents

---

### BotSelectionDialog
**File:** `werewolf-client/app/games/[id]/components/BotSelectionDialog.tsx`
**Props:** `{ bots, onConfirm, onCancel }`
**Built on:** Custom dialog
**Used in:** 1 place — `GamePage.tsx`
**Behavior:** Checkbox list of bots to select which ones should respond next
**Visual notes:** Uses `buttonTransparentStyle`, `buttonBlackStyle`

---

### ModelSelectionDialog
**File:** `werewolf-client/app/games/[id]/components/ModelSelectionDialog.tsx`
**Props:** `{ currentModel, botName, onConfirm, onCancel }`
**Built on:** Custom dialog, ModelSelectDropdown
**Used in:** 1 place — `GamePage.tsx`
**Behavior:** Change AI model for a specific bot mid-game
**Visual notes:** Uses `buttonTransparentStyle`, `buttonBlackStyle`

---

### ConfirmModal
**File:** `werewolf-client/app/games/[id]/components/ConfirmModal.tsx`
**Props:** `{ title, message, onConfirm, onCancel }`
**Built on:** Custom
**Used in:** 1 place — `GameChat.tsx`
**Behavior:** Generic confirmation dialog with Yes/No buttons
**Visual notes:** Uses `buttonTransparentStyle`

---

### DraggableDialog
**File:** `werewolf-client/app/games/[id]/components/DraggableDialog.tsx`
**Props:** `{ title, children, onClose, initialPosition? }`
**Built on:** Custom (mouse drag events)
**Used in:** 1-2 places — game page dialogs
**Behavior:** Window-style draggable container
**Visual notes:** Dark background, border, drag handle

---

### MentionDropdown
**File:** `werewolf-client/app/games/[id]/components/MentionDropdown.tsx`
**Props:** `{ players, query, onSelect, position }`
**Built on:** Custom
**Used in:** 1 place — `GameChat.tsx`
**Behavior:** Autocomplete dropdown for @mentioning players in chat
**Visual notes:** Absolute positioned, dark background, player-colored items

---

## Game List Components (`/app/games/components/`)

---

### RemoveGame
**File:** `werewolf-client/app/games/components/RemoveGame.tsx`
**Props:** `{ gameId, ownerEmail }`
**Built on:** Custom
**Used in:** 1 place — `app/games/page.tsx`
**Behavior:** Delete button for removing a game from the list
**Visual notes:** Uses theme classes, `buttonTransparentStyle`

---

## Profile Components (`/app/profile/components/`)

---

### TierSwitcher
**File:** `werewolf-client/app/profile/components/TierSwitcher.tsx`
**Props:** `{ currentTier, userId, apiKeys, balance, initialTab? }`
**Used in:** 1 place — `app/profile/page.tsx`
**Behavior:** Tab bar (Free / API / Paid) switching between tier panels

### FreeTierPanel
**File:** `werewolf-client/app/profile/components/FreeTierPanel.tsx`
**Props:** `{ isActive }`
**Used in:** 1 place — `TierSwitcher.tsx`
**Behavior:** Shows free tier limitations and available models

### ApiTierPanel
**File:** `werewolf-client/app/profile/components/ApiTierPanel.tsx`
**Props:** `{ isActive, userId, apiKeys }`
**Used in:** 1 place — `TierSwitcher.tsx`
**Behavior:** API key management UI, model access info

### PaidTierPanel
**File:** `werewolf-client/app/profile/components/PaidTierPanel.tsx`
**Props:** `{ isActive, userId, balance }`
**Used in:** 1 place — `TierSwitcher.tsx`
**Behavior:** Paid tier info, balance display, top-up button (Stripe checkout)

### ApiKeyManagement
**File:** `werewolf-client/app/profile/components/ApiKeyManagement.tsx`
**Props:** `{ userId, apiKeys }`
**Used in:** 1 place — `ApiTierPanel.tsx`
**Behavior:** Add/remove API keys for different AI providers

### AddApiKeyForm
**File:** `werewolf-client/app/profile/components/AddApiKeyForm.tsx`
**Props:** `{ userId, onKeyAdded }`
**Used in:** 1 place — `ApiKeyManagement.tsx`
**Behavior:** Form to add a new API key (provider selector + key input)

### ApiKeyList
**File:** `werewolf-client/app/profile/components/ApiKeyList.tsx`
**Props:** `{ apiKeys, userId, onKeyRemoved }`
**Used in:** 1 place — `ApiKeyManagement.tsx`
**Behavior:** List of saved API keys with masked display + delete button

### ModelPricingTable
**File:** `werewolf-client/app/profile/components/ModelPricingTable.tsx`
**Props:** None
**Used in:** 1 place — `app/profile/page.tsx`
**Behavior:** Table showing all AI models with pricing per tier

### SpendingsDisplay
**File:** `werewolf-client/app/profile/components/SpendingsDisplay.tsx`
**Props:** `{ spendings }`
**Used in:** 1 place — `app/profile/page.tsx`
**Behavior:** Monthly spending visualization/chart

### FreeUserLimits
**File:** `werewolf-client/app/profile/components/FreeUserLimits.tsx`
**Props:** Unknown — needs confirmation
**Used in:** 1 place — `FreeTierPanel.tsx`
**Behavior:** Displays free tier limitations (games per day, models available)

### VoiceInfoSection
**File:** `werewolf-client/app/profile/components/VoiceInfoSection.tsx`
**Props:** None
**Used in:** 1 place — `app/profile/page.tsx`
**Behavior:** Information about voice/TTS configuration

### VoiceProviderSelector
**File:** `werewolf-client/app/profile/components/VoiceProviderSelector.tsx`
**Props:** `{ currentProvider, onChange }`
**Used in:** Unknown — needs confirmation
**Behavior:** Dropdown/radio to select TTS provider (Google / OpenAI)

---

## Providers (Context)

---

### ThemeProvider
**File:** `werewolf-client/app/providers/ThemeProvider.tsx`
**Exports:** `ThemeProvider`, `useTheme()`
**Used in:** `app/layout.tsx` (provider), `app/components/ThemeSwitcher.tsx` (consumer)
**Behavior:** Manages light/dark theme via `data-theme` attribute, persists to localStorage, respects system preference

### LoginDialogProvider
**File:** `werewolf-client/app/providers/LoginDialogProvider.tsx`
**Exports:** `LoginDialogProvider`, `useLoginDialog()`
**Used in:** `app/layout.tsx` (provider), `components/login-dialog.tsx` + `components/auth-buttons.tsx` + `app/components/PlayNowButton.tsx` (consumers)
**Behavior:** Controls login modal open/close state and callback URL

### UIControlsContext
**File:** `werewolf-client/app/games/[id]/context/UIControlsContext.tsx`
**Exports:** `UIControlsProvider`, `useUIControls()`
**Used in:** `GamePage.tsx` (provider), game components (consumers)
**Behavior:** Manages game UI state (modal open/close, controls enabled/disabled)

---

## Uncategorized Markup (one-off patterns that recur)

1. **Feature cards** — The 3-card grid on `/` uses inline card markup (`p-6 rounded-xl theme-bg-card theme-border border shadow-sm` with colored icon circles). This pattern also appears on `/about`.

2. **Section headings with underline decoration** — `/about`, `/privacy`, `/terms` all use `underline decoration-btn decoration-4 underline-offset-8` on `<h2>` elements. Not a component.

3. **Error/warning banners** — At least 3 different banner styles:
   - Yellow border warning (`border-2 border-yellow-600`) on `/games`
   - Blue info loading banner (`bg-blue-900 bg-opacity-50 border border-blue-500`) on `/games/newgame`
   - Red error banner (`bg-red-900 bg-opacity-50 border border-red-500`) on `/games/newgame`
   - Green success banner (`bg-green-500/10 border border-green-500/30`) on `/profile`
   These should probably be a single `Banner` / `Alert` component.

4. **Form input pattern** — The `newgame` page defines local `inputStyle`, `labelStyle`, `flexRowStyle`, `flexItemStyle` strings (line 475-479). These are effectively inline "components" that should be primitives.

5. **Button styles** — Two shared constants (`buttonTransparentStyle`, `buttonBlackStyle`) in `app/constants.tsx` used across 12 files (49 total occurrences). Also a one-off primary CTA style on the home page. Should become Button component variants.

6. **Game list card** — The `GameListEntryContent` function in `/games/page.tsx` (line 106) is effectively an inline component with card-like markup.

7. **Player card in preview** — The per-bot card in `/games/newgame/page.tsx` (lines 741-873) is a complex repeated pattern with name/gender/voice/AI/playstyle fields. Could be a `PlayerPreviewCard` component.

---

## Summary

| Category | Count |
|----------|-------|
| Root shared components | 4 |
| App-level components | 4 |
| Game page components | 8 |
| Profile components | 12 |
| Game list components | 1 |
| Context providers | 3 |
| **Total** | **32** |

### Top 5 by usage (via theme utility classes, 201 total hits across 32 files):
1. `theme-text-primary` / `theme-text-secondary` — used in virtually every page and component
2. `theme-bg-card` / `theme-border` / `theme-shadow` — used in 20+ components
3. `buttonTransparentStyle` constant — 49 occurrences across 12 files
4. `buttonBlackStyle` constant — used in newgame, GamePage, and dialog components
5. NavBar — rendered on every page via root layout
