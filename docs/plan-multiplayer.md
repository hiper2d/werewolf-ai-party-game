# Plan: multiplayer (shared games with several human seats)

Status: design draft, 2026-09-19. Nothing implemented. Written up from a brainstorm with
Alex on 2026-09-18/19; the "Decisions" section is what he settled, the "Design" section is
how the code would carry it, "Open questions" is what is still his call.

Goal: let several humans sit at one table with the bots. A game is created and driven by a
host, friends join through an invite link, each human plays a character from the cast, and
the bots cannot tell who is human. Solo play must not change for existing users.

## Decisions (Alex, 2026-09-18/19)

1. **No relay through Vercel.** SSE was removed (commit b89f888) because open function
   invocations burned the Hobby CPU budget; polling would do the same. Live updates go
   browser → Firestore directly (`onSnapshot`), authenticated with a Firebase custom token
   minted from the NextAuth session. Vercel is touched only by actual moves.
2. **The host's browser stays the game engine.** Exactly one browser advances bots. Guests
   read the doc and call small actions for their own moves. If the host is away, bots
   pause; humans keep chatting. (A driver lease is a later option, not v1.)
3. **The queue head names the actor.** Every phase is already a queue of names. Bot at
   the head → host processes it. Human at the head → that human's browser shows the
   control, their action pops the queue. Everyone else renders "waiting for X".
4. **Humans never block on bots.** A human message is just a message. Bot reply rounds
   are triggered by pacing (debounce + cooldown + per-day bot budget), sized by the GM
   (never zero in practice, so silence comes from the deterministic levers, not the GM),
   with a host button to force a round.
5. **Vote starts by agreement.** Each alive human presses "Vote"; the button stays pressed
   for them and shows a counter to the others; they may unpress until everyone has
   pressed. All pressed → voting begins. The auto-vote ceiling remains, plus a time-based
   ceiling that does not depend on bot messages.
6. **The preview becomes a persisted game state (DRAFT), owned by the host.** Only the
   host edits global fields and triggers generation/regeneration. Invites work from the
   first minute. Joined players edit only their own character (name, story, visual
   description, voice) and their avatar with the existing edit tool: candidates, previous
   sheets ("image maps"), reframe, mannequin.
7. **Regeneration is never locked.** A whole-cast regeneration resets joined players'
   picks; they re-claim from the new cast and may pick a face from any previous sheet.
   The mannequin sheet guarantees everyone has a face on join.
8. **Humans claim characters from the generated cast.** Unclaimed characters become bots
   at Start. Roles are assigned per character at Start. Zero-bot games are allowed
   (humans-only Werewolf with a narrating GM, or no narration at all).
9. **Models are host-only, always.** Lobby: host sets bot and GM models, visible to all.
   In game: only through the recovery flows (retry, provider reassignment, GM swap), with
   a system line in chat. Guests never change models: it is spend and a sync point.
10. **Any tier can join any game.** The game's tier is the host's tier: it decides the
    model catalog and per-model bot caps. Tier guards check seat membership, not tier
    equality.
11. **Billing.** Free seats are debited the full cost of every call in every game they sit
    in (allowance accounting, as if solo, no matter who pays the money). The paid host
    pays the full real cost by default. If the host enables "split" in the preview, the
    real cost is divided evenly among paid seats. Paid guests otherwise pay nothing. A seat
    that runs dry (free allowance or paid balance) blocks the game for everybody with that
    seat's name on the banner. No "cover for X" button.
12. **Redraws become unlimited for everyone.** `FREE_TIER_AVATAR_REGENS` goes; the daily
    spend cap already bounds image spend. Keep the counter for stats.
13. **No rewinds in shared games.** Message deletion, delete-after trims, night replay and
    the one-shot model override on retry are solo-only. A game is `shared` from the first
    guest claim, permanently.
14. **Night errors must not name the bot.** In shared games the host is a player. The
    error banner and the retry dialog address a failed night actor by queue slot, never by
    name.

## Context: what the code does today

- One human is baked in: `humanPlayerName`, `humanPlayerRole`, `humanPlayerIsAlive` on the
  game doc, ~140 references across `bot-actions.ts`, `night-actions.ts`,
  `game-actions.ts`, prompts and utils.
- The browser drives the state machine: `GamePage.tsx` calls `welcome`, `talkToAll`,
  `vote`, `performNightAction`, `replayNight` in sequence, one in flight at a time
  (`runGameAction`). Nothing loops on the server.
- A human message: saved first, then `selectRespondingBots` fills
  `gameStateProcessQueue`, the client loops `talkToAll` per bot, input disabled while the
  local `isProcessing` flag or the queue is non-empty (`GameChat.tsx`).
- The full game doc, including every bot's role and model, ships to the browser.
- Access is owner-only: `page.tsx` redirects non-owners, `ensureUserCanAccessGame`
  (`tier-guards.ts`) throws on owner mismatch and on tier mismatch.
- Firestore is admin-only. `firebase/client.ts` is empty, `firestore.rules` is the
  expired starter template, so browsers can read nothing directly.
- The preview is browser state on `app/games/newgame/page.tsx` plus a per-user avatar
  draft (`avatar-draft-actions.ts`). Nothing shareable exists until `createGame`, and the
  game page starts bot introductions on load.
- Avatars: sheets kept per round, per-character docs `games/{id}/avatars/{key}`,
  `selectAvatarVariant` and `reframeAvatar` write one key and cost nothing. Candidate index
  == sheet round is an invariant. Image route and all avatar actions gate through
  `ensureUserCanAccessGame`.
- Billing: every spend goes through `recordSpend` (`cost-tracking.ts`), one user, one
  transaction. Free-tier guard `assertFreeSpendWithinLimit` runs before every ask for the
  session user via `setBeforeAskHook`.
- Free-tier caps that are per game: per-model bot count from price bands
  (`ai-models.ts`) and one portrait redraw. Everything else is per user, per device or
  global (`FREE_TIER_LIMITS`, `config/limits`).

## Design

### 1. Transport: Firestore listeners

- Server action `getFirebaseClientToken()` mints a custom token
  (`admin.auth().createCustomToken(uid)`) from the NextAuth session; uid = a stable hash
  of the email (or the user doc id). The client signs in once with
  `signInWithCustomToken`; the SDK refreshes on its own.
- The game page subscribes to `games/{id}` (public projection), `games/{id}/seats/{uid}`
  (own private state), `games/{id}/messages` filtered by recipient, and
  `games/{id}/avatars/*`.
- Rules (`firestore.rules`): a user may read `games/{id}` and its avatars/messages if
  `request.auth.uid in resource.data.seatUids` (denormalised array on the game doc);
  may read `seats/{uid}` only for their own uid; messages readable if `recipientName ==
  'ALL'` or the message's audience contains the reader's character (see 2.3). Browsers
  never write; every write stays a server action with the admin SDK.
- Cost: one read per changed doc per listener. A 4-human game with ~500 updates is a few
  thousand reads, inside the free quota. Idle listeners cost nothing.
- Solo games use the same path (one listener), which removes the local `isProcessing`
  flag and the "action response is the only feed" model.

### 2. Data model

#### 2.1 Game doc (public projection, readable by all seats)

```
gameState: 'DRAFT' | 'LOBBY' | 'WELCOME' | ... (existing states)
shared: boolean                 // set true on first guest claim, never cleared
inviteToken: string             // random; host may regenerate to revoke links
hostUid: string                 // replaces ownerEmail as the admin identity (keep ownerEmail)
seatUids: string[]              // denormalised for rules
seats: Record<uid, {            // public part of a seat
    characterKey: string | null // claimed character, null while browsing
    displayName: string
    tier: 'free' | 'paid'
    joinedAt: number
}>
splitPaidCost: boolean          // host toggle, editable until Start
characters: Character[]         // was `bots`; each has `controller: 'bot' | uid`
                                // public fields only: name, story, visualDescription,
                                // voice, aiType (aiType hidden from guests in game, see 7)
voteReady: string[]             // uids who pressed Vote this day
lastRoundEndedAt: number        // pacing
dayStartedAt: number            // time-based vote ceiling
```

`humanPlayerName/Role/IsAlive` are replaced by `characters[].controller` plus per-seat
private docs. Legacy solo games are migrated on read by `gameFromFirestore`: one seat for
the owner, the human name becomes a character with `controller = ownerUid`.

#### 2.2 Private docs

- `games/{id}/private/state` (admin only): roles per character, night results, the
  werewolf list, anything the GM knows. Server actions read it; browsers never can.
- `games/{id}/seats/{uid}` (own uid only): the seat's role, its role card, its own night
  results, "your action is due" hints. Written by the server when roles are assigned or
  a night resolves.

`characters[].role` leaves the public doc. Everything that renders a role today reads it
from `seats/{me}` (own) or from the public doc only after death or game over.

#### 2.3 Messages

Existing `recipientName` stays. Add `audience: string[]` (character keys) for
werewolf-chat and role-private messages so a rule can filter without knowing roles:
`resource.data.audience.hasAny([myCharacterKey])` where `myCharacterKey` comes from the
seat doc (rules can `get()` it). `ALL` messages carry no audience.

#### 2.4 Avatar candidates

A candidate becomes an explicit `{ round, cell, framing }` instead of the implicit
"cell of this character on sheet `round`". Needed because after a regeneration the new
cast no longer lines up with old sheets and a player may pick any cell from any kept
sheet. `reframeAvatar` already stores framing per sheet; this widens the same record.

### 3. States and the lobby

```
DRAFT  → host fills the form, generates/regenerates the cast, invites
LOBBY  → cast exists; humans claim and edit characters; host presses Start
WELCOME → unchanged from here
```

- `createGame` writes the doc in DRAFT. The new-game page becomes listener-driven over
  that doc (fields read from the doc, written through a small patch action). Solo users:
  create → DRAFT → LOBBY → Start with the same clicks as today, or auto-start when no
  invite was ever opened.
- Join page `/games/{id}/join?t=<token>`: sign-in required, token check, tier recorded on
  the seat, shows unclaimed characters. Claim is a transaction (two people cannot take the
  same character). Claiming sets `shared = true`.
- Host controls in lobby: regenerate cast, reroll one unclaimed character, redraw
  portraits, kick, lock lobby, regenerate invite token, Start.
- Start: assigns roles over the final cast (`controller` decides human vs bot), writes
  `private/state` and every `seats/{uid}`, transitions to WELCOME. Role balance for small
  tables (5 to 7 players) needs a table; today's minimum is 8.
- Avatars: the sheet is drawn when the lobby opens (as creation does today). A rerolled
  character shows the mannequin until Start; at Start a small sheet of rerolled cells is
  drawn. A host redraw adds candidates for everyone but only switches the shown face for
  characters whose owner has not made a manual pick (new flag `pickIsManual` on the
  per-character avatar doc).
- Lobby copy: "free players' daily allowance applies in this game", and "X is covering
  this game" / "cost is split among paid players" from the toggle.

### 4. Day discussion

- `sendMessage(gameId, text)`: any seated alive human, any time. Writes the message,
  returns. No LLM call. Optimistic append on the sender's screen.
- The host's browser watches the doc and calls `startRound(gameId)` when all hold:
  process queue empty; human messages newer than `lastRoundEndedAt`; humans quiet for
  `debounceMs` (default 3s); `cooldownMs` since `lastRoundEndedAt` (default 30s). Both
  intervals are per-game settings.
- `startRound` = today's `selectRespondingBots` over the new messages, fills the queue.
  The host loops `talkToAll` as now. Bots read the day history at their turn, so a human
  message mid-round is seen by the next bot.
- Per-day bot budget: the existing day activity counter becomes a hard ceiling on bot
  messages per day. Auto-vote threshold counts bot messages only.
- Host button "let the table respond" = today's `manualSelectBots`, bypasses cooldown.
- The "waiting for bots" indicator is derived from the doc for every client; the local
  `isProcessing` flag goes.

### 5. Voting

- `toggleVoteReady(gameId)`: transaction adds/removes the uid in `voteReady`, then
  compares the set with alive human seats; if complete, the same transaction transitions
  to VOTE. Presses after VOTE are ignored server-side.
- A death removes the uid from `voteReady` in the same write.
- The vote queue keeps its fixed order of names. Human at the head → that human's
  browser shows the vote modal, `humanPlayerVote` (generalised to "the seat whose
  character is at the head") records and pops. Host has "skip absent player" (random or
  abstain per rules) so a closed laptop cannot stall the vote.
- Ceilings: auto-vote by bot message count (existing) and `dayStartedAt + maxDayMs`
  shown as a countdown.
- Solo degrades to today: one human, one press.

### 6. Night

- Night queue lists roles in order (existing). Role held by a human → the host's
  `performNightAction` returns a "waiting for human" no-op; that human's browser shows the
  night modal from its seat doc; `performHumanPlayerNightAction` (generalised per seat)
  pops. Werewolf chat with human werewolves = messages with a werewolf `audience`, round
  logic = the same debounce as day.
- Every queue pop is a transaction that checks the head is still the expected name
  (extends the stale-action no-op pattern).
- Night results are written to `private/state` and projected into each `seats/{uid}`; the
  public narration goes to messages as today.
- **What non-acting clients see: nothing.** During the night every client that is not at
  the head shows "the night is in progress" with no name and no role. A "waiting for Alice"
  hint at night would reveal her role. Bot night actions may get a small random delay so a
  human's slower turn does not stand out.
- **Several human werewolves.** Today the werewolf param queue is coordination slots in
  order and the last name decides the kill. Replace the decider:
  - Coordination is a room, not a turn: human werewolves post in the wolf room at any time
    during the phase (messages with the werewolf `audience`); bot werewolves take their
    coordination slots in order, driven by the host, reading the room when they speak.
  - The kill is a vote among alive werewolves: bots submit at their slot, each human
    werewolf gets the target modal once coordination slots are done; the phase closes when
    every wolf has submitted (checked in the transaction that records each vote, same
    shape as `toggleVoteReady`). Majority wins; tie → earliest werewolf in the queue (or
    random, to settle). One human plus bots yields today's behaviour in practice.
  - Absence: a wolf who does not submit before the night time ceiling, or is skipped by the
    host's unnamed "skip pending player" button, is dropped from the vote. No submissions →
    no kill that night.
- Other roles exist once per game (doctor, detective, maniac), so "both humans hold it"
  cannot happen; several humans with different roles are just sequential queue heads.

### 7. Permissions

| Action | Host | Guest |
|---|---|---|
| Edit global preview fields, generate, regenerate, reroll, redraw | yes | no |
| Edit own character text and avatar (candidates, sheets, reframe, mannequin) | own | own |
| Invite, kick, lock, Start, split toggle | yes | no |
| Send day message, vote-ready toggle, own vote, own night action | yes | yes |
| Advance bots (`welcome`, `talkToAll`, `vote`, `performNightAction`, rounds) | yes | no |
| Models (lobby, retry, provider reassignment, GM swap) | yes | no |
| Cancel bot responses, retry failed call | yes | no |
| Message deletion, delete-after, night replay, model override on retry | solo only | no |
| See model tags on bots during the game | yes | no (lobby and game over only) |

`ensureUserCanAccessGame` becomes `ensureSeat(gameId, uid)` returning the seat and
whether it is the host; the tier mismatch check applies to host-only actions only.

### 8. Billing

- Payer set for a call: `splitPaidCost ? paidSeats : [host]`. Free seats are always
  debited the full amount as allowance.
- Pre-call guard: every free seat's daily/monthly allowance, every payer's balance.
  Any failure blocks with that seat's name; the error is a `SystemErrorMessage` with
  `blockedBy: uid`.
- `recordSpend` becomes one transaction over all seat user docs: full amount to each free
  seat's `dailySpend` and `spendings`, `amount / payers.length` to each payer's balance,
  one `requestStats` row per call with a `split` map so refunds and reports reconcile.
- `createdWithTier` = host tier at creation, unchanged in meaning: catalog and per-model
  bot caps. `validateModelUsageForTier` runs against it.
- Games-per-day cap counts creations only; joining is unlimited.
- Device metering applies to each seat's own browser as today.

### 9. Errors in shared games

- Banner is rendered from `errorState` on the doc for every client; only the host gets
  Retry and model controls, guests see "the host is fixing it".
- Night failures: `errorState.slot` (queue index) instead of `botName`; the retry
  override targets the slot. No bot name in copy or logs visible to the client.
- Provider blocks (`providerBlocks`) unchanged, host-only reassignment.

### 10. Solo-only features

Gated on `shared === false`: message deletion routes, delete-after trims, `replayNight`,
`retryWithModelOverride`. Retry-same-model and `cancelBotResponses` stay available.

### 11. Prompts

Bots already address the human by name as a fellow player; with several humans nothing
changes in the day prompt except that `humanPlayerName` references become the list of
human-controlled characters where the prompt needs it at all (ideally nowhere: bots should
not know). The GM selection prompt gets the new human messages of the round.

### 12. Gaps found on review (2026-09-19)

Decisions still needed (also listed under Open questions):

- **Voice.** `generateSpeechAction` returns audio inline and bills per generation; nothing
  is stored. With N browsers playing every bot line the same audio is paid N times. Change
  to generate once per message (store the file, e.g. `games/{id}/audio/{messageId}` in
  Storage or a Firestore blob doc), bill it once under the seat billing rule as part of
  that message's cost, and let every client fetch and decide only whether to play it.
- **Dead humans.** Proposed: they keep the listener and stay silent viewers; no new
  information (roles stay hidden) until game over. Their seat doc stops receiving night
  results.
- **Leave / kick mid-game.** Proposed: the character's `controller` flips to `'bot'` with a
  host-chosen default model, so no phase waits on an empty seat. Mirror of hot-join.
- **Welcome phase.** Human characters: type their own introduction, or the GM reads their
  story. Both cheap; pick one.
- **Suggestions (`getSuggestion`).** GM advice costs money. Proposed: available to every
  seat, billed under the seat rule like any call.

Mechanical, to include in the steps above:

- Games list: "games I sit in" query needs an `array-contains` index on `seatUids`
  (`firebase deploy --only firestore:indexes`).
- Ops: enable Firebase Auth in the project, add the public client config
  (`NEXT_PUBLIC_FIREBASE_*`) to env, deploy `firestore.rules`.
- Per-seat rate limit on `sendMessage` (free of LLM cost but each send is a Vercel
  invocation and a Firestore write); reuse `INPUT_LIMITS` for length.
- Every reader of `humanPlayerName` / `humanPlayerRole` outside the state machine gets the
  seat version: cinematic mode, night briefing, role card, day summary, mention dropdown,
  mid-day illustrations, story chapters, `getSuggestion` prompt, GM narration prompts.
- Game over: the reveal copies roles from `private/state` into the public doc at that
  moment, and only then.
- Host deletes a game with seated guests: allowed, guests are redirected to the list with
  a notice.
- Logging: seat uid and host uid on every game log line so the debugging skill can still
  find a user's activity.
- Testing: Jest for the claim, vote-ready, queue-pop and payer-set transactions; a scripted
  two-browser run for turn order (extend the `verify` skill with a multi-client mode).

## Rollout order

Each step is shippable on its own and does not change solo play.

1. **Transport + rules.** Custom token action, `firebase/client.ts`, rules, listener hook,
   solo game page reads from the listener, `isProcessing` removed. Private data split
   (`private/state`, `seats/{uid}`, roles off the public doc). Legacy read migration.
2. **Seats and LOBBY.** Seat model, invite token, join page, claim transaction, Start
   assigns roles, `ensureSeat`, permission matrix, `shared` flag and solo-only gates,
   spectator-quality read for guests (they can watch a game they sit in).
3. **Day pacing.** `sendMessage`, `startRound`, debounce/cooldown, bot day budget,
   derived "waiting" indicator, force-round button.
4. **Vote and night for several humans.** `voteReady` toggle, queue-head generalisation
   for votes and night actions, skip-absent, time ceiling, night errors by slot,
   werewolf `audience`.
5. **Billing.** Payer set, multi-user `recordSpend`, per-seat guard, blocked-by banner,
   split toggle, redraw cap removal.
6. **DRAFT as a shared state.** Preview moved onto the game doc, listener-driven
   new-game page, host-only globals, per-character editing for guests, candidate triple
   and "browse image maps", regenerate/reroll rules, manual-pick flag on redraw.
7. **Small tables.** Role balance for 5 to 7 players, humans-only mode, "no narration"
   toggle.

## Open questions

- Cast size on the form: total players only, with humans replacing bots at Start (the
  plan assumes this), or a declared human count for balance?
- Should the host also claim a character from the cast, or keep entering their own name
  as today? The plan assumes the host claims like everyone else.
- Driver lease when the host disconnects: v1 pauses bots. Decide after play sessions.
- Hot-join into a running game (a friend takes over a living bot's character): cheap
  under this model, not in v1.
- Spectator seats (no character): a seat kind with read access and no actions. Not in v1.
- Debounce/cooldown defaults and whether they are exposed on the form.
- Voice: generate-once-per-message storage and its billing (section 12).
- Dead humans: silent viewers with roles hidden until game over (section 12).
- Leave/kick mid-game: character falls back to a bot (section 12).
- Welcome introductions for human characters: typed or GM-read (section 12).
- Suggestions for guests: allowed and billed under the seat rule (section 12).
- Werewolf kill vote tie-break: earliest wolf in the queue, or random (section 6).

## Out of scope

- Public lobbies, matchmaking, strangers: this is friends-on-a-call multiplayer.
- Server-driven games with timers and no browser open.
- Collaborative editing of global preview fields (per-field presence): host-only for now.
- Any change to the ai-agents library.
