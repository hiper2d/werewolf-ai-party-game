# Game Screen Specification — `/games/[id]`

This is the **complete, exhaustive** specification of every control, element, and state on the game screen. Use this as the ground truth when designing. Do not invent controls that aren't listed here. Do not omit controls that are listed here.

---

## Overall Layout

The screen has **3 zones** that must all be present:

1. **Campfire Scene** (top) — visual representation of players around fire
2. **Chat Panel** (center/bottom) — message history + input
3. **Status/Queue Panel** — game progress and bot queue (currently a right sidebar on desktop, needs to be integrated into the new design)

On **mobile/tablet**: the left (players) and right (status) panels are hidden behind edge-toggle buttons that open as drawer overlays.

---

## ZONE 1: Campfire Scene (replaces Left Panel — Player Roster)

### Data to Display Per Participant

Each character in the campfire scene represents a participant. There are 3 types:

#### Game Master (always 1)
- Name: "Game Master"
- AI model name (e.g. "Claude 4.6 Opus") — clickable to change model
- Always alive
- Special color: coral red (#FF6B6B)
- Per-bot cost (e.g. "$0.0234") — shown as font-mono text

#### Human Player (always 1)
- Name + "(You)" suffix
- Role name (e.g. "werewolf", "villager", "doctor")
- Always alive (until game over)
- Player color assigned by hash

#### AI Bots (5-15)
- Name
- Role — revealed when: dead, game over, or teammate (human werewolf sees other werewolves marked with 🐺)
- AI model name — **clickable button** to open ModelSelectionDialog
- Alive/dead status — dead: show 💀 emoji, name has line-through, 60% opacity
- Per-bot cost (font-mono, e.g. "$0.0234") — only if cost > 0
- Player color (10 muted colors assigned by name hash)

### Game Info (also in this zone)
- **Game theme** (h1, e.g. "Harry Potter") — bold, prominent
- **Game description** — small secondary text below title
- **Total Game Cost** — font-mono, e.g. "Total Game Cost: $0.0714". Only shown if > 0

### Interactions
- **Click bot's AI model label** → opens **ModelSelectionDialog** to change that bot's AI model
- **Hover/click character sprite** → show participant details (name, role if visible, model, cost)

---

## ZONE 2: Chat Panel

### Header Bar
- **Title:** "Day {N}: {phase}" (e.g. "Day 1: day discussion", "Day 2: night")
  - When viewing history: "Day {N}: history"
- **Message count:** "{N} messages" — right side, only shown when not loading
- **Day selector** (only when game has multiple days):
  - Label "History:" (hidden on mobile)
  - Dropdown button "Day {N} ▼" — opens list of all days
  - Each day option: "Day {N}" + "(current)" suffix for current day
  - Selecting a non-current day shows a read-only history view with italic notice: "Viewing Day {N} history (read-only)"

### Message List (scrollable area)

#### Message Types and Their Visual Treatment

1. **Game Master — Day message** (green tint)
   - Author name in green color
   - Green background tint (bg-green-100 dark:bg-green-900/50)
   - Green border
   - Prefix: "🎭" for GM commands

2. **Game Master — Night message** (blue tint)
   - Author name in blue color
   - Blue background tint (bg-blue-100 dark:bg-blue-950/60)
   - Blue border
   - Prefix: "🌙" for night announcements

3. **Bot message** (player-colored)
   - Author name in player's assigned color
   - Background: player color at 20% opacity
   - No border

4. **Human player message** (right-aligned)
   - Author name in secondary text color
   - Background: slate/grey tint
   - Text alignment: right

5. **Vote message** (orange tint)
   - Prefix: "🗳️ Votes for {target}: "{reason}""
   - Orange background + border

6. **Night action messages** (various prefixes):
   - Werewolf: "🐺 Selected {target} for elimination. Reasoning: {text}"
   - Doctor: "🏥 Protected {target} from werewolf attacks. Reasoning: {text}"
   - Detective: "🔍 Investigated {target}. Reasoning: {text}. {result}"
   - Maniac: "🔪 Abducted {target}. Reasoning: {text}"

7. **Game story** — displayed as plain text (story field from game narrative)

#### Per-Message Controls (appear on hover on desktop, always visible on mobile)

Each message has these controls in the top-right corner:

1. **Delete/Reset button** (X icon) — only on bot messages and human day discussion messages
   - Opens a dropdown menu with:
     - Reset count indicator: "{N} resets left today" (free tier only, null = unlimited for API tier)
     - "Delete from here (incl.)" — deletes this message and all after it
     - "Delete after here (excl.)" — keeps this message, deletes everything after
   - Both options trigger a **ConfirmModal** before executing
   - Disabled (30% opacity) when reset limit = 0

2. **TTS Speaker button** — on every message with content
   - States:
     - **Default:** speaker icon (🔊 style SVG)
     - **Loading:** spinning circle (loading audio)
     - **Playing:** pause icon (two vertical bars) — click to pause
     - **Paused:** play icon (triangle) — click to resume
   - Uses the bot's assigned voice + voice style

#### Per-Message Metadata
- **Cost badge** — shown next to author name if cost > 0, font-mono, e.g. "$0.0234"

#### Loading/Processing Indicators (bottom of message list)
- **Thinking indicator:** 3 bouncing blue dots + text: "{BotName} is thinking..." / "{BotName} is voting..." / "Processing..."
- Shown during: bot processing, voting, welcome introductions, external loading

#### Error Display (inline, bottom of message list)
- Red background panel with error icon
- Text: "{BotName} failed to respond" (or "An error occurred")
- Error details (truncated to 150 chars)
- Hint: "If this keeps happening, try changing the AI model"
- **Retry button** — clears error state and retries

#### Empty/Loading States
- "Loading Day {N}..." when fetching messages
- "No messages for Day {N} yet." when empty
- "Deleting messages..." during deletion

#### Scroll Controls
- Auto-scrolls to bottom on new messages
- **Scroll-to-top button** — appears when scrolled down >300px, fixed position bottom-right, chevron-up icon

### Input Area

#### Text Input
- **Textarea** — resizable (2 rows default, expands to 10 on expand button click)
- **Placeholder text** (contextual, changes by game state):
  - Day Discussion (idle): "Type a message..."
  - Day Discussion (processing): "Waiting for {BotName} to respond..."
  - Night (werewolf coordination): "Coordinate with other werewolves..."
  - Night (other): "Night phase: {Role} is taking action..."
  - After Game Discussion (idle): "Share your thoughts about the game..."
  - After Game Discussion (processing): "Waiting for {BotName} to respond..."
  - Game Over: "Game has ended - chat disabled"
  - History view: "Viewing Day {N} history"
  - Recording: "🎤 Recording in progress... Click mic to stop"
  - Transcribing: "✨ Transcribing audio, please wait..."
  - Welcome/other: "Waiting for game to start..."
- **Disabled** when: modals open, history view, recording/transcribing, external loading, processing, game over, bots in queue
- **Enabled** when: Day Discussion (queue empty), After Game Discussion, Night werewolf coordination (human is werewolf, first in queue, multiple players in param queue)
- **@mention autocomplete:** typing "@" shows a dropdown of player names filtered by query. Navigate with arrow keys, select with Enter/Tab, dismiss with Escape
- **Submit:** Cmd+Enter or Ctrl+Enter sends the message

#### Cancel Button (overlaid on input, top-right corner)
- Red circle with X — appears after **10 seconds** of bot processing
- Cancels pending bot responses and restores pre-action game state

#### Toolbar Row (below textarea)

**Left group — text buttons:**

1. **Send button** — only visible when input is enabled
   - Label: "Send" / "Sending..." (with spinner)
   - Disabled during processing

2. **Game control buttons** (contextual by game state):

   **During DAY_DISCUSSION (queue empty, no processing):**
   - **Vote** — starts voting phase
     - Normal state: default transparent style
     - Warning state (70-90% to auto-vote): yellow background, "Vote ⚠️"
     - Urgent state (90%+): red background, pulsing animation, "Vote ⚠️"
     - Tooltip shows: "Start the voting phase (X% to auto-vote)" or "Vote now! Auto-voting in N messages"
   - **Go on** — lets 2-4 more bots speak
     - Tooltip: "Let 2-4 bots continue the conversation"

   **During DAY_DISCUSSION (queue active):**
   - No buttons shown (bots are processing)

   **During VOTE_RESULTS (no game-over condition):**
   - **🌙 Start Night** — blue background, white text
     - Tooltip: "Begin the night phase where werewolves and special roles take their actions"

   **During VOTE_RESULTS (game-over condition detected):**
   - Game-over reason text (red, e.g. "Werewolves outnumber villagers")
   - **🎭 Game Over** — red background, white text
     - Tooltip: "End the game and move to after-game discussion"

   **During NIGHT:**
   - Text label: "🌙 Night in progress..." (yellow)

   **During NIGHT_RESULTS (no game-over):**
   - **Replay Night** — replays night phase actions
     - Tooltip: "Clear night messages and replay the night phase actions"
   - **Next Day** — advances to new day
     - Tooltip: "Continue to apply night results and start new day"

   **During NIGHT_RESULTS (game-over condition):**
   - **Replay Night** (same as above)
   - **Game Over** — red background, white text

   **During NEW_DAY_BOT_SUMMARIES:**
   - Text label: "💭 {BotName} is generating summary... ({N} remaining)" (blue)

   **During GAME_OVER:**
   - Text label: "Game Over" (red, bold)
   - **Exit Game** — red background, white text, returns to /games

   **During AFTER_GAME_DISCUSSION (queue empty):**
   - **Go on** — same as day discussion
   - **Exit Game** — red background, white text

   **During AFTER_GAME_DISCUSSION (queue active):**
   - No buttons shown

**Right group — icon buttons (only when input enabled or recording):**

3. **Microphone button** (square, 40x40)
   - Default: mic SVG icon
   - Recording: red-bordered, pulsing stop-square icon
   - Transcribing: spinning circle, disabled
   - Disabled when: modals open, processing, voting, night action, getting suggestion

4. **AI Suggestion button** (💡) — only during DAY_DISCUSSION
   - Gets AI-generated message suggestion and fills the textarea
   - Shows spinner when loading

5. **Expand/Shrink button** (⬆️/⬇️)
   - Toggles textarea between 2 rows and 10 rows

---

## ZONE 3: Status/Queue Panel

### Queue Display (changes by game state)

| Game State | Title | Description |
|------------|-------|-------------|
| WELCOME | "👋 Introductions" | "Bots introducing themselves (N/M done):" + list of remaining bots |
| DAY_DISCUSSION | "💬 Discussion Queue" | "Bots will talk in this order:" / "No bots thinking currently" |
| VOTE | "🗳️ Voting Queue" | "Bots will vote in this order:" + ordered list |
| NIGHT | "🌙 Night Actions" | "Current: {role}" with player/message count details |
| NEW_DAY_BOT_SUMMARIES | "💭 Summary Generation" | "Generating summaries for:" + list |
| VOTE_RESULTS | "📊 Vote Results" | "Processing vote results..." |
| NIGHT_RESULTS | "🌅 Night Complete" | "Night phase finished - ready to start new day" |
| GAME_OVER | "🎭 Game Over" | "Game has ended" |
| AFTER_GAME_DISCUSSION | "💬 After Game Discussion" | Same as day discussion |

### Queue List Items
- Each item shows player name in their player color
- Current item: blue highlight background + "▶ Current" badge
- Other items: grey background
- Human player gets "(You)" suffix

### Empty Queue State
- Robot emoji (🤖) centered
- Text: "All bots are idle"

### Progress Bar
- Shown when queue has items
- Blue fill bar showing completion percentage
- Text: "Progress: {N} remaining" or "Almost done"

### Manual Bot Selection Button
- "✋ Select Bots Manually" — full-width button
- Only shown during DAY_DISCUSSION or AFTER_GAME_DISCUSSION when queue is empty
- Opens **BotSelectionDialog**

---

## MODALS

### VotingModal
- **Trigger:** auto-opens when it's the human player's turn to vote (first in vote queue)
- **Content:** list of alive players (excluding self), each as a selectable option
- **Input:** reason text for the vote
- **Actions:** Submit vote, Close (only when not submitting)

### NightActionModal
- **Trigger:** auto-opens when it's the human player's turn for night action AND they're last in param queue (target selection needed)
- **Content:** role-specific UI:
  - **Werewolf:** select target to attack
  - **Doctor:** select target to heal OR one-time kill ability
  - **Detective:** select target to investigate OR one-time kill ability
  - **Maniac:** select target to abduct
- **Actions:** Perform action, Close (only when not submitting)

### ModelSelectionDialog
- **Trigger:** clicking any bot's AI model name in the participant list
- **Content:** bot name, current model, dropdown of available models (with tier-based availability)
- **Actions:** Confirm model change, Close

### BotSelectionDialog
- **Trigger:** "Select Bots Manually" button in status panel
- **Content:** checkbox list of alive bots with their day activity count and the human player name
- **Actions:** Confirm selection, Close

### ConfirmModal
- **Trigger:** delete message actions
- **Content:** "Confirm Deletion" title, description of what will be deleted
- **Actions:** Confirm, Cancel

---

## MOBILE-SPECIFIC CONTROLS

### Edge Toggle Buttons (fixed, vertical center of screen)
- **Left edge:** people/users icon — opens Players panel as left drawer
- **Right edge:** list icon — opens Status panel as right drawer

### Drawer Overlay
- Background: semi-transparent black overlay (click to dismiss)
- Panel: slides in from left or right, max 85vw or 320px
- Close button (X) in header
- Contains same content as desktop panels

---

## GAME STATES REFERENCE

| State | Constant | What's Happening |
|-------|----------|------------------|
| WELCOME | `WELCOME` | Bots introducing themselves one by one |
| DAY_DISCUSSION | `DAY_DISCUSSION` | Free chat, human and bots take turns |
| VOTE | `VOTE` | Each player votes in queue order |
| VOTE_RESULTS | `VOTE_RESULTS` | Elimination result displayed |
| NIGHT | `NIGHT` | Night actions processed in role order |
| NIGHT_RESULTS | `NIGHT_RESULTS` | Night outcome displayed |
| NEW_DAY_BOT_SUMMARIES | `NEW_DAY_BOT_SUMMARIES` | Bots generate internal summaries |
| GAME_OVER | `GAME_OVER` | Game ended, no more actions |
| AFTER_GAME_DISCUSSION | `AFTER_GAME_DISCUSSION` | Post-game free chat |

---

## PLAYER COLORS

10 muted colors assigned by name hash + Game Master coral:

| Index | Color | Hex |
|-------|-------|-----|
| 0 | Muted blue-grey | #6B8E9E |
| 1 | Muted purple-grey | #8B7B8B |
| 2 | Muted green-grey | #7B8B6B |
| 3 | Muted red-grey | #8B6B6B |
| 4 | Muted blue-purple | #6B6B8B |
| 5 | Muted yellow-grey | #8B8B6B |
| 6 | Muted teal-grey | #6B8B7B |
| 7 | Muted purple | #7B6B8B |
| 8 | Muted brown-grey | #8B7B6B |
| 9 | Muted steel blue | #6B7B8B |
| GM | Coral red | #FF6B6B |

These will likely need to be more saturated/vivid for the new dark campfire background.
