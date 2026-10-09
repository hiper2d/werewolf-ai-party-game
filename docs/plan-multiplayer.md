# Plan: multiplayer (shared games with several human seats)

Status: design draft. Nothing implemented. Brainstormed with Alex on 2026-09-18/19, gaps
settled 2026-09-20, simplified 2026-10-01 (game creation unchanged, queue as lock, host
drives blind, strict per-seat privacy, send cooldown). The "Decisions" section is what Alex settled, the "Design" section
is how the code would carry it, "Open questions" is what is still Alex's call.

Goal: let several humans sit at one table with the bots. The host creates a game exactly as
today, friends join through an invite link and take over bot characters, and the bots
cannot tell who is human. Solo play must not change for existing users beyond the day chat
no longer locking while bots talk.

## Decisions (Alex)

1. **No relay through Vercel.** SSE was removed (commit b89f888) because open function
   invocations burned the Hobby CPU budget; polling would do the same. Live updates go
   browser → Firestore directly (`onSnapshot`), authenticated with a Firebase custom token
   minted from the NextAuth session. Vercel is touched only by actual moves.
2. **Game creation stays as it is.** The host fills the form, generates the cast and
   creates the game as today, including their own name and role choice. A shareable game
   opens in a new LOBBY state instead of starting introductions; a solo game starts
   automatically, exactly as now. No shared preview, no
   persisted draft. (2026-09-30)
3. **Guests take a bot's slot.** A joined player picks an unclaimed bot character in the
   lobby and becomes it, inheriting its role. Before Start they may edit everything the
   preview lets the host edit on a bot: name, story, visual description, voice, voice
   style, and the portrait with the avatar tool (candidates, sheets, reframe, mannequin).
   Play style and model are bot-only and do not apply. The cast size is whatever the host
   set; humans replace bots, so the number of guests is at most the number of bots. Zero-bot games are allowed. (2026-09-30)
4. **No joining after Start.** The invite link stops working when the host presses Start.
   The viewer link keeps working. (2026-09-30)
5. **The queue is the lock.** Every phase is already a queue of names. When the day queue
   is empty, any player's message fills it: the player's own `sendMessage` runs bot
   selection over that message, server-side. While it is
   non-empty, humans chat freely and their messages add no bots; queued bots see them
   because each bot reads the day history at its turn. A message posted while the last
   bot is generating may go unanswered: accepted, the next message starts a new round.
   (2026-09-30)
6. **The host's browser runs the queues, blind.** Filling is anyone's; running is the
   host's. The host's browser is today's solo loop over the shared doc: it says "next"
   and the server, which alone knows the hidden queue, runs the bot at the head or
   answers "waiting" when a human is there. Introductions, bot turns, bot votes, bot
   night actions, summaries and phase steps all run this way. One engine means no
   claims, leases, timers or races between browsers. Host away → a filled queue waits
   and bots stay silent; humans keep chatting; the host's return resumes it. (2026-10-01)
7. **No browser receives what its seat may not know.** Not in the game doc, not in a
   message query, not in an action response, not in a log line shown to the client.
   Roles, night queues, night results and role-private messages live in private docs
   readable only by the server or by the seat they belong to; Firestore rules enforce it;
   actions return `ok | waiting | no-op | rejected | error` and never game data. The host
   is a player and gets no exception. Today the full doc and the action responses carry
   all of it, which is fine solo and a cheat channel in multiplayer. (2026-10-01)
8. **Send cooldown: 5 s per player.** After sending, a player's composer is replaced by a
   loader with a 5 s countdown bar (same look as the current bot-selection loader).
   Enforced on the server too. Stops endless spamming, which would otherwise be free of
   LLM cost but not of Vercel invocations and Firestore writes. (2026-09-30)
9. **Vote starts by agreement.** Each alive human presses "Vote"; the button stays pressed
   for them and shows a counter to the others; they may unpress until everyone has
   pressed. All pressed → voting begins. The auto-vote ceiling by bot message count
   remains; no time ceiling (bots only talk after a human message, and the host's "skip
   absent player" covers a human who never presses).
10. **Werewolf night unchanged: the last wolf decides.** The wolf turn list is every alive
   wolf twice, shuffled; each slot is a line in the wolf room and the last slot picks the
   victim, human or bot. No kill vote, no tie-break. (2026-09-30)
11. **Models are host-only, always.** Lobby: host sets bot and GM models, visible to all.
    In game: only through the recovery flows (retry, provider reassignment, GM swap), with
    a system line in chat. Guests never change models: it is spend and a sync point.
12. **Any tier can join any game.** The game's tier is the host's tier: it decides the
    model catalog and per-model bot caps. Tier guards check seat membership, not tier
    equality.
13. **Billing.** Free seats are debited the full cost of every call in every game they sit
    in (allowance accounting, as if solo, no matter who pays the money). The paid host
    pays the full real cost by default. If the host enables "split" in the lobby, the
    real cost is divided evenly among paid seats. Paid guests otherwise pay nothing. A seat
    that runs dry (free allowance or paid balance) blocks the game for everybody with that
    seat's name on the banner. No "cover for X" button.
14. **No rewinds in shared games.** Message deletion, delete-after trims, night replay and
    the one-shot model override on retry are solo-only. A game is `shared` from the first
    guest claim, permanently.
15. **Night errors must not name the bot.** In shared games the host is a player. The
    error banner and the retry dialog address a failed night actor by queue slot, never by
    name.
16. **(2026-09-20)** Spoken lines are stored once and replayed for free; dead humans and
    link viewers get read-only seats; a leaver's character becomes a bot; no welcome turn
    for humans; the ghostwriter suggestion becomes a private advisor. Details in
    Design §12.

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
- Roles are assigned in `createGame` (`game-actions.ts`): shuffled distribution, the
  human's role choice swapped into slot 0, bots get the rest.
- Werewolf night: with more than one alive wolf the param queue is the wolf list twice,
  shuffled (`bot-actions.ts`); every slot but the last is a coordination message
  (`humanPlayerTalkWerewolves` for the human), the last picks the target.
- The full game doc ships to the browser on every load and in every action response
  (`getGame` → `gameFromFirestore`, unfiltered): every bot's role and model, the night
  queues with the wolves' names (`gameStateParamQueue`), night results. Messages are the
  one filtered path (`app/api/games/[id]/messages/route.ts` adds role-private recipients
  only for the human's role), but action responses bypass it: `performNightAction`
  returns a bot's night messages directly (`night-actions.ts` ~812).
- Access is owner-only: `page.tsx` redirects non-owners, `ensureUserCanAccessGame`
  (`tier-guards.ts`) throws on owner mismatch and on tier mismatch.
- Firestore is admin-only. `firebase/client.ts` is empty, `firestore.rules` is the
  expired starter template, so browsers can read nothing directly.
- The game page starts bot introductions on load.
- Avatars: sheets kept per round, per-character docs `games/{id}/avatars/{key}`,
  `selectAvatarVariant` and `reframeAvatar` write one key and cost nothing. Image route
  and all avatar actions gate through `ensureUserCanAccessGame`.
- Billing: every spend goes through `recordSpend` (`cost-tracking.ts`), one user, one
  transaction. Free-tier guard `assertFreeSpendWithinLimit` runs before every ask for the
  session user via `setBeforeAskHook`.
- Free-tier caps that are per game: per-model bot count from price bands
  (`ai-models.ts`) and one portrait redraw. Everything else is per user, per device or
  global (`FREE_TIER_LIMITS`, `config/limits`).
- Cinematic auto-play voices every line on every client that has it on, and each
  generation is billed (see §12, stored audio).

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
gameState: 'LOBBY' | 'WELCOME' | ... (existing states)
shared: boolean                 // set true on first guest claim, never cleared
inviteToken: string | null      // random; host may regenerate; cleared at Start
viewerToken: string             // separate read-only link
hostUid: string                 // admin identity (keep ownerEmail)
seatUids: string[]              // denormalised for rules
seats: Record<uid, {            // public part of a seat
    characterKey: string        // the host's own character, or the claimed bot's
    displayName: string
    tier: 'free' | 'paid'
    kind: 'player' | 'viewer'
    joinedAt: number
    lastMessageAt: number       // send cooldown
}>
splitPaidCost: boolean          // host toggle, editable until Start
characters: Character[]         // was `bots` + the human; each has
                                // `controller: 'bot' | uid`; public fields only
dayQueueLength: number          // public: how many bots are queued in the day, no names
stepCounter: number             // bumps on every engine step; the host's loop and the
                                // seats' "is it my turn" checks key off it, no names
voteReady: string[]             // uids who pressed Vote this day
```

`humanPlayerName/Role/IsAlive` are replaced by `characters[].controller` plus per-seat
private docs. Legacy solo games are migrated on read by `gameFromFirestore`: one seat for
the owner, the human name becomes a character with `controller = ownerUid`.

#### 2.2 Private docs

- `games/{id}/private/state` (admin only): roles per character, every queue that can
  reveal a role (night process and param queues, the wolf turn list), night results,
  the werewolf list, anything the GM knows. The day bot queue can stay public: a day
  queue is selected by the GM over public messages and reveals nothing. Server actions read it; browsers never can.
- `games/{id}/seats/{uid}` (own uid only): the seat's role, its role card, its own night
  results, "your action is due" hints. Written by the server when a seat claims a
  character or a night resolves.

`characters[].role` leaves the public doc. Everything that renders a role today reads it
from `seats/{me}` (own) or from the public doc only after death or game over. Bot models
(`aiType`) are host-visible only during the game: a model tag hints at "bot" and is a
host lever, so the public projection omits it and the host reads it from a host-only doc.

#### 2.2.1 What may reach a browser

| Data | Who | How |
|---|---|---|
| Public messages, public doc (state, day, alive list, names, stories, portraits, voices, day queue, step counter, vote-ready) | every seat | listener |
| Own role, own night results, own "your turn" | that seat | `seats/{uid}` |
| Role-private messages (wolf room, detective, doctor, maniac) | seats in `audience` | listener with rule |
| Roles of others | nobody until death reveal / game over | copied to public doc at that moment |
| Night queues, wolf list, GM state | nobody | `private/state`, server only |
| Bot models | host (and everyone at lobby / game over) | host-only doc |

Action responses carry none of it: `ok | waiting | no-op | rejected | error` plus at most
the caller's own new message id. Clients learn everything through their listeners, which
the rules filter. Error banners and client-visible logs follow the same table (§9).

#### 2.3 Messages

Existing `recipientName` stays. Add `audience: string[]` (character keys) for
werewolf-chat and role-private messages so a rule can filter without knowing roles:
`resource.data.audience.hasAny([myCharacterKey])` where `myCharacterKey` comes from the
seat doc (rules can `get()` it). `ALL` messages carry no audience.

### 3. Lobby

```
new-game form (unchanged) → createGame → LOBBY → host presses Start → WELCOME
```

- `createGame` is unchanged except that it writes `gameState: 'LOBBY'`, the host's seat
  and the invite/viewer tokens. Roles are assigned there as today; the host's role choice
  still works. The game page renders the lobby instead of starting introductions.
- Solo starts automatically as today: no lobby screen, no extra click. How the form
  tells solo from shared (an "invite friends" toggle, or a lobby only when the host opens
  the invite link) is an implementation detail for step 4.
- Join page `/games/{id}/join?t=<token>`: sign-in required, token check, tier recorded on
  the seat, shows unclaimed bot characters. Claim is a transaction (two people cannot
  take the same character): sets `controller = uid`, writes the seat doc with the
  inherited role, sets `shared = true`.
- A guest edits their character before Start with the same fields and avatar tool as the
  preview: name, story, visual description, voice, voice style, portrait. Names are
  identifiers and the cast's stories mention each other, so a rename replaces the old
  name across all stories in the same write. Nothing has been said yet, so no message
  history to fix.
- A guest may release their claim and pick another character before Start.
- Host controls in lobby: models, split toggle, kick (character reverts to a bot),
  regenerate invite token, Start. Start clears `inviteToken` and moves to WELCOME.
- Lobby copy: "free players' daily allowance applies in this game", and "X is covering
  this game" / "cost is split among paid players" from the toggle.

### 4. Queues: anyone fills, the host runs

- **Filling the day queue (any player).** `sendMessage(gameId, text)`: any seated alive
  player, any time. Saves the message. If the day queue is empty, runs
  `selectRespondingBots` over the new message, then writes the names in a transaction
  that re-checks the queue is still empty; if another sender filled it meanwhile, the
  selection is discarded (one wasted Jev call, ~$0.0001) and the message stays plain
  chat. This is the only AI call a guest's browser ever causes for the game engine, and
  it is one call per deliberate message, not a loop.
- **While the queue is non-empty**, messages are saved and nothing else happens. Bots
  read the day history at their turn, so mid-round messages are seen by the bots still
  queued. A message that lands while the last bot is generating goes unanswered: accepted.
- **Running every queue (host's browser only).** The host's game page keeps today's
  solo effect loop, fed by the listener instead of action responses. For every automatic
  step (introductions, `talkToAll`, bot votes, `performNightAction`, day summaries,
  `selectDayResponders`, end of night) it calls the action with no target; the server
  reads the hidden queue and either runs the bot at the head (`ok`) or finds a human
  there (`waiting`). On `waiting` the loop stops until `stepCounter` changes. Each pop is
  a transaction checking the head is still the expected name (stale-action no-op
  pattern). Guests' pages have no engine loop at all.
- **Duplicates.** One engine, so no races between browsers. The only duplicate source is
  the host's own reload or second tab, same as solo today; a browser-side tab guard
  (BroadcastChannel / localStorage) keeps one host tab as the engine if it matters.
- **Host away.** A filled queue waits; humans keep chatting; bots resume when the host's
  page is back. A call already in flight when the host's tab closes still finishes on
  the server.
- **Send cooldown.** `sendMessage` rejects when `now - seat.lastMessageAt < 5 s`
  (`rejected`, the composer keeps the draft). The client replaces the composer with a
  loader and a 5 s countdown bar after each send, the same component as the
  bot-selection loader. Length stays under `INPUT_LIMITS`.
- **Per-day bot budget.** The day activity counter becomes a hard ceiling on bot
  messages per day. Auto-vote threshold counts bot messages only.
- The "bots are talking" indicator is derived from `dayQueueLength` for every client;
  the local `isProcessing` flag goes. The host's "let the table respond" button
  (`manualSelectBots`) stays.

### 5. Voting

- `toggleVoteReady(gameId)`: transaction adds/removes the uid in `voteReady`, then
  compares the set with alive human seats; if complete, the same transaction transitions
  to VOTE (a pure write, no AI call; the host's loop then runs the bot votes). Presses
  after VOTE are ignored server-side.
- A death removes the uid from `voteReady` in the same write.
- The vote queue keeps its fixed order of names. Human at the head → that human's
  browser shows the vote modal, `humanPlayerVote` (generalised to "the seat whose
  character is at the head") records and pops. Bot at the head → the host's loop runs it.
  Host has "skip absent player" (abstain) so a closed laptop cannot stall the vote, plus
  "replace with bot" for a player who is seated but unresponsive.
- Ceiling: auto-vote by bot message count (existing). No time ceiling.
- Solo degrades to today: one human, one press.

### 6. Night

- Night queues (roles in order, and the per-role player list) live in `private/state`.
  The host's loop calls `performNightAction(gameId)` blind: bot at the head → the server
  runs it and returns `ok`; human at the head → `waiting`, the server sets that seat's
  `yourTurn` in `seats/{uid}`, and that human's browser shows the night modal (or the
  wolf-room input) from its own seat doc. `performHumanPlayerNightAction` /
  `humanPlayerTalkWerewolves` (generalised per seat) pop and bump `stepCounter`, which
  restarts the host's loop. The host's browser never learns whose turn it was, even
  when the host is a villager driving a night full of wolves.
- Every queue pop is a transaction that checks the head is still the expected name.
- Night results are written to `private/state` and projected into each `seats/{uid}`; the
  public narration goes to messages as today.
- **What non-acting clients see: nothing.** During the night every client that is not at
  the head shows "the night is in progress" with no name and no role. A "waiting for Alice"
  hint at night would reveal her role. Bot night actions may get a small random delay so a
  human's slower turn does not stand out. Exception: wolves see the wolf turn list, since
  they already know each other.
- **Werewolves, any mix of humans and bots:** today's mechanism, unchanged. The turn list
  is every alive wolf twice, shuffled, e.g. `[H1, Bot, H2, H1, H2, Bot]`. A human at the
  head gets the wolf-room input (`humanPlayerTalkWerewolves`, generalised per seat); a bot
  at the head is run by the host's loop; the last slot picks the target, whoever it is.
  Wolf room messages carry the werewolf `audience`, so the rules keep them from every
  non-wolf browser, the host's included. The bot wolf reads the room server-side.
- An absent human at a night head: the host's unnamed "skip pending player" (the slot is
  passed; a skipped last wolf slot passes the decision to the previous wolf; no
  submissions → no kill) or "replace with bot".
- Other roles exist once per game (doctor, detective, maniac), so several humans with
  different roles are just sequential queue heads.

### 7. Permissions

| Action | Host | Guest |
|---|---|---|
| Create game, form, cast generation, redraws before creation | yes | no |
| Claim/release/edit own character in lobby (name, story, voice, portrait) | own (host has theirs from the form) | own |
| Invite, kick, regenerate invite, Start, split toggle | yes | no |
| Send day message, vote-ready toggle, own vote, own night action | yes | yes |
| Fill the day queue with a message | yes | yes |
| Run queues (engine loop), phase-step buttons (start night, start new day, keep going) | yes | no |
| Models (lobby, retry, provider reassignment, GM swap) | yes | no |
| Skip absent player, replace with bot | yes | no |
| Cancel bot responses, retry failed call | yes | no |
| Message deletion, delete-after, night replay, model override on retry | solo only | no |
| See model tags on bots during the game | yes | no (lobby and game over only) |

`ensureUserCanAccessGame` becomes `ensureSeat(gameId, uid)` returning the seat and
whether it is the host; the tier mismatch check applies to host-only actions only.

### 8. Billing

- Payer set for a call: `splitPaidCost ? paidSeats : [host]`. Free seats are always
  debited the full amount as allowance. Who drives the queue never matters for billing.
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
not know). The GM selection prompt gets the message that filled the queue.

### 12. Settled 2026-09-20

- **Voice is stored once per spoken line.** Today `generateSpeechAction` returns audio inline
  and bills per generation; a reload, a re-listen or a second listener pays again, and
  cinematic auto-play makes every client generate every line. New:
  `games/{id}/audio/{messageId}` doc (base64 audio, mime, provider, voice signature, cost),
  same pattern as the avatar docs, no Storage bucket. Generation stays lazy: the first
  client to press play calls `speakMessage(gameId, messageId)`, which claims the doc in a
  transaction (`status: 'generating'`), generates, writes, and bills once under the seat
  billing rule as part of that message; a concurrent caller sees the claim and waits for
  the doc. Served by `/api/games/[id]/audio/[messageId]` with the seat guard and long cache
  headers. The key includes a hash of voice + style so a mid-game voice change yields a new
  file. Applies to solo games too. Caveat: Firestore TTL deletes the game doc but not its
  subcollections; avatars already have this gap, so a cleanup job for expired games'
  subcollections (avatars, audio, seats, private) is owed regardless.
- **Seat kinds: player and viewer.** A dead human keeps their player seat with all actions
  removed, keeps knowing their own role, learns nothing new until game over. A viewer seat
  comes from the viewer link (login required), sees public messages only until game
  over, never role-private ones. Later: `visibility: 'private' | 'link' | 'public'` on the
  game doc for a public gallery, no model change needed.
- **A leaver becomes a bot.** Leave or kick flips `characters[].controller` to `'bot'` with
  the game's default model (host may change it later like any bot). The character keeps its
  story and the message history, so the bot continues in character. If the seat was at a
  queue head, the head now names a bot and the host's loop takes over. The host leaving
  is different: the host's page is the engine, so bots pause until it is back.
- **No welcome turn for humans.** Bots introduce themselves and the day begins; a human's
  first message is whatever they choose.
- **Advisor replaces the ghostwriter.** `getSuggestion` today writes a line in the player's
  voice (`HUMAN_SUGGESTION_PROMPT`). Replace it with a private second-person strategic hint
  built from the seat's own private state (role, own night results) plus public history,
  never other seats' roles. Available to every player seat, billed under the seat rule,
  rate-limited to a few per day phase.

Mechanical, to include in the steps above:

- Games list: "games I sit in" query needs an `array-contains` index on `seatUids`
  (`firebase deploy --only firestore:indexes`).
- Ops: enable Firebase Auth in the project, add the public client config
  (`NEXT_PUBLIC_FIREBASE_*`) to env, deploy `firestore.rules`.
- Every reader of `humanPlayerName` / `humanPlayerRole` outside the state machine gets the
  seat version: cinematic mode, night briefing, role card, day summary, mention dropdown,
  mid-day illustrations, story chapters, `getSuggestion` prompt, GM narration prompts.
- Game over: the reveal copies roles from `private/state` into the public doc at that
  moment, and only then.
- Host deletes a game with seated guests: allowed, guests are redirected to the list with
  a notice.
- Logging: seat uid and host uid on every game log line so the debugging skill can still
  find a user's activity.
- Testing: Jest for the claim, fill-if-empty, vote-ready, queue-pop, send-cooldown and
  payer-set transactions, plus a privacy suite: for each seat kind and role, the public
  doc, the seat doc, rule-filtered message queries and every action response contain
  nothing from the 2.2.1 "nobody" rows (Firestore emulator for the rules); a scripted two-browser run for turn order
  (extend the `verify` skill with a multi-client mode).

## Rollout order

Each step is shippable on its own and does not change solo play (step 3 unlocks the solo
composer while bots talk, deliberately).

1. **Transport + rules.** Custom token action, `firebase/client.ts`, rules, listener hook,
   solo game page reads from the listener, `isProcessing` removed. Private data split
   (`private/state`, `seats/{uid}`, roles off the public doc). Legacy read migration.
2. **Stored audio.** `speakMessage` + audio route; a solo win on its own, and a
   prerequisite before several clients auto-play the same lines.
3. **Queue as lock.** `sendMessage` with fill-if-empty, host-only engine loop keyed on
   `stepCounter`, `waiting` result, 5 s send cooldown with the countdown loader, bot day
   budget, derived indicator, minimal action responses.
4. **Seats and LOBBY.** LOBBY state after `createGame`, seat model, invite/viewer tokens,
   join page, claim/release/edit, Start, `ensureSeat`, permission matrix, `shared` flag
   and solo-only gates, seat kinds, dead-player read-only mode, kick/leave → bot.
5. **Vote and night for several humans.** `voteReady` toggle, queue-head generalisation
   for votes and night actions (wolf room per seat), skip-absent, replace with bot, time
   ceiling, night errors by slot, werewolf `audience`.
6. **Billing.** Payer set, multi-user `recordSpend`, per-seat guard, blocked-by banner,
   split toggle, redraw cap removal, advisor replacing the ghostwriter suggestion.
7. **Small tables.** Role balance for 5 to 7 players, humans-only mode, "no narration"
   toggle.

## Open questions

- Phase-step buttons in shared games (start night, start new day): host-only (plan), or
  any alive player, or a ready-toggle like Vote?

## Out of scope

- Hot-join into a started game.
- Public lobbies, matchmaking, strangers: this is friends-on-a-call multiplayer.
- Server-driven games with timers and no browser open.
- A shared or collaborative new-game form.
- Any change to the ai-agents library.
