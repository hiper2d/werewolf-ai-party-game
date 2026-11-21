# Plan: growth roadmap (starter games, multiplayer, UI, credits)

Status: draft, 2026-11-20 (track 1 decisions added the same day). Nothing implemented. Order agreed with Alex: (1) starter
games, (2) multiplayer, (3) UI if it still seems worth it, (4) free/paid tiers →
credits. Track 1 is designed in detail; the others are scoped and point at their own
plans.

## Why: the numbers (read 2026-11-19/20, own account excluded)

- ~5.5 signups a day (164 in the last 30 days).
- Of 409 users who signed up 31–150 days ago: 61% ever played, 86% of players played on one
  day only, 8% were still active 14+ days after signup, 4% 30+ days. 20–30 real regulars.
- First games, last 30 days (113 players): 28 finished. Of the 78 one-game players, 18 left
  in WELCOME (11 bots introducing themselves one by one, before the player can type a word)
  and 32 during day 1's discussion. 64% of them never reached the first vote.
- The form defaults to 12 players, 3 wolves, 3 special roles; 68 of 113 first games ran with
  11 bots.
- Nobody pays: the only `stripe_events` rows are Alex's own. Free spend per player: median
  $0.24 lifetime, p90 $2.45; 18 players ever passed $5. The daily $5 cap was hit 4 times in
  30 days.

Conclusion: the leak is the first ten minutes, not pricing. The first game is long, slow to
start, and set up by a form that a third of signups never get through.

---

## Track 1 — Starter games (pre-created first game)

### Goal

A new player presses one button and is talking at the table within seconds. The game is
small enough to reach a vote, a night and a death in the first session.

### What the player sees

1. After the first sign-in (no games yet), the player lands on `/games/start` instead of
   `/games` or the form.
2. 3 cards: art, title, one-line hook ("Rain on the roof, ale on the table, and one of the
   regulars is not what they seem."). A "Your name" field, prefilled from the account's
   first name. "Play". Below: "Create your own game" → the existing form.
3. Play → the game page opens in DAY 1 DISCUSSION, in cinematic mode, with voices on. The
   opening story and every character's introduction are already in the chat, pre-voiced,
   and the portraits are already drawn. The role card is on top: the player is a villager.
   The composer is live as soon as the introductions have played (or are skipped).
4. Helper mode is on (section below): hints on the screen say what the player can and
   should do at each step.

The `/games` list gets a "Quick start" entry too, so returning players can use the
templates again.

### Starter templates (built once, by us)

A Firestore collection `starterGames/{templateId}` (no TTL), written by a script, read-only
to the app:

- Setup: theme, opening story (`scene`), language, art style, game mode, the GM's voice +
  style, the voice provider.
- The cast: 6 bots with name, story, gender, voice, voiceStyle, playStyle,
  visualDescription — exactly the `BotPreview` shape `createGame` takes.
- Portraits: the `avatars` and `avatarVariants` subcollections, the same layout a preview
  draft has, so the copy is `copyDraftIntoGame`'s loop pointed at a template instead of a
  draft.
- The introductions: the WELCOME GM command (with its stored `turnTail`) and each bot's
  introduction message, recorded once by running the real WELCOME flow on a throwaway game.
  The human's name is a fixed placeholder (`Newcomer`) while recording, and is replaced
  whole-word in the copied messages and tails at creation.
- Voice: the opening story (GM voice) and the six introductions as stored audio in
  `starterGames/{id}/audio/{messageKey}`, generated once by the build script. Firestore
  docs cap at 1 MiB and Gemini TTS returns raw PCM (~48 KB/s), so the script encodes to a
  compressed format first. The copied messages carry an `audioKey`; the chat's speak path
  plays the stored clip instead of calling TTS. The first minute of every starter game then
  costs nothing in voice and plays without waiting on TTS. Later lines use live TTS as
  usual.
- The welcome scene illustration that cinematic mode opens on, drawn once with the sheet.

`scripts/build-starter-game.ts --theme "…" --id tavern`: runs the normal preview pipeline
with the starter table, draws the portrait sheet and the scene, creates a throwaway game,
runs the introductions, records the audio, and copies all of it into
`starterGames/tavern`. Alex reads and listens to the result before it goes live
(`status: draft | live`). Cost: one preview, one sheet, one scene, six intros and seven
voice clips per template, once.

### The three launch themes (Alex, 2026-11-20)

| Id | Theme | Feel |
|---|---|---|
| `tavern` | Fantasy world: a gathering at a tavern | warm, classic Werewolf, the default card |
| `starship` | A spaceship crew | sci-fi, isolated, "one of us is not human" |
| `ninja-academy` | An anime ninja school | light, energetic, rivalries and teachers |

Each theme is written as a short GM instruction for the build script (setting, tone, why
these seven people are together tonight). Cards show the scene illustration.

### The starter table

- **7 players: the human + 6 bots.** 2 werewolves, a doctor and a detective (no maniac),
  2 villagers. Small enough that day 1 is a few rounds, big enough that one lucky vote
  does not end it.
- **Human role: always villager** (Alex, 2026-11-20). The simplest role to learn: talk,
  suspect, vote. No night action to explain; the night plays out in cinematic mode as a
  story. The bots' roles are shuffled per game among the other six slots.
- **Voice and cinematic mode on.** The starter game opens in cinematic mode with autoplay
  on, regardless of the browser's saved switch (`autoPlay` in localStorage); the player can
  still turn either off, and that choice is saved as usual.
- **Models:** a fixed set from the cheapest group with 100+ measured turns and a `fast` tag,
  one per bot, mixed providers for variety. GM: a fast model already allowed as GM. Stored
  on the template, re-checked against the catalog at creation (a removed model falls back
  through `resolveModelId`).
- **Day 1 is short:** a lower auto-vote ceiling for starter games (the existing
  bot-message-count ceiling, set per game) and the GM's "you can vote now" line after the
  first round.

### Server side

`createStarterGame(templateId, playerName)` in `app/api/starter-game-actions.ts`:

1. Auth, the same tier/model guards `createGame` runs (`validateModelUsageForTier`,
   `assertAllowedAsGameMaster`, `assertFreeSpendWithinLimit`), the per-day game count.
2. Screen `playerName` (Jev screen, source `name`). It is the only text the player types.
3. Build the game doc as `createGame` does (shared helper, not a copy: extract
   `buildGameDoc` from `createGame`), with `starterTemplateId`, `avatarsStatus: 'ready'`,
   `gameState: DAY_DISCUSSION`, an empty queue. Roles shuffled per game, so the same
   template plays differently.
4. Copy the portraits and write the GAME_STORY message, then the WELCOME command and the
   intro messages with fresh timestamps and the placeholder name replaced.
5. `recordFeatureEvent('starter_game_created', {templateId, role, language})`.

Nothing the template holds is typed by the player, so the cast screen and the art-style
screen are skipped. Every later message goes through the normal paths: bots see the intros
as ordinary day-1 history, and the prompt-cache prefix rules are unchanged.

### Routing

- First sign-in: NextAuth's sign-in callback already writes the user doc. Add `gamesCreated`
  (a counter `createGame` and `createStarterGame` increment; game docs expire after 30
  days, so they cannot answer "has this user ever played"). `/games` redirects to
  `/games/start` while `gamesCreated` is 0.
- Landing page: the "Play" call to action goes to `/games/start` after sign-in.

### Measuring it

Per starter game: reached the first vote, reached night 1, finished, second game within 7
days. Baseline from the same read on regular first games: 36% reached the first vote, 25%
finished. `scripts/starter-game-report.ts` joins `featureEvents` with the game docs. Two
weeks of new users is ~80 first games, enough to see a difference this size.

### Languages

The templates are English first. 14 languages are supported; a template per language is
the same build script with `--language`. Start with the languages new users actually pick
(`feature-events-report.ts --days 30`), and show a non-English player the form-first flow
until their language has templates.

### Helper mode (hints on screen)

A hint layer that says what the player can and should do right now. On for every starter
game (`game.helperMode: true`), off for games made with the form, with a "Hide hints"
switch in the game menu (saved per browser). Hints are UI chrome, so English only, like the
rest of the interface.

Each hint is one entry in a table (`app/games/[id]/helper-hints.ts`): when it shows (game
state, day, a condition such as "the player has not sent a message yet"), the text, and
the element it points at (a `data-hint="vote-button"` attribute on the target). A small
`HelperHints` component picks the first matching hint that has not been dismissed, shows it
as a callout anchored to that element, and records the dismissal per game in localStorage.
The same component renders inside `CinematicMode`, since that is where the starter game
opens.

First set of hints:

| When | Points at | Says |
|---|---|---|
| First open, role card closed | the chat | "Everyone here has a secret role. Two of them are werewolves. Talk to find them." |
| Day 1, the player has not written yet | the composer | "Ask someone a question, or say who you suspect. Characters answer when you write." |
| After the first round of replies | a character's name/portrait | "Mention a name to make that character answer you." |
| Day discussion, enough messages for a vote | the Vote button | "Heard enough? Start the vote." |
| VOTE | the vote panel | "Pick who you think is a werewolf. The player with the most votes is out." |
| VOTE_RESULTS | the result line | "That player's role is revealed. Was it a werewolf?" |
| NIGHT (villager) | the night story | "Night: werewolves choose a victim, the doctor protects someone, the detective checks someone. You sleep." |
| New day | the night result | "Someone may have died in the night. Use what you know: who acted strangely?" |
| Player eliminated | the chat | "You're out, but you can watch the rest of the game." |
| GAME_OVER | the post-game panel | "Now make your own: any theme, any cast." → the form |

The Game Master's lines stay as they are; helper mode is UI only, so prompts and caches are
untouched. Hints reach every starter game, so their copy is reviewed like a News entry.

### Playing without signing in (proposal, decision pending)

The "signed up but never played" third suggests the sign-in step itself loses people. A
guest could play one starter game before signing in:

- **Identity:** a guest user `guest:<deviceId>` (the existing device-id cookie +
  localStorage UUID), created when a signed-out visitor presses Play. Server actions get
  the actor from one helper that returns the session email or the guest id; game access
  checks compare against it.
- **Only starter games:** no form, no previews, no paid models. The table is already the
  cheapest group and the intros and their voices are pre-recorded.
- **Cost guard:** measured 2026-11-20, a free game costs a median $0.39 and $1.54 at p90
  (11 bots, with portraits and an intro round). A starter game skips the portraits and the
  intros, has 6 bots on cheap models, so expect well under $0.50. Guards: a per-guest cap
  (e.g. $1), one guest game per device and per IP per day, and a global daily guest budget
  in `config/limits` (e.g. $5/day); past it the Play button asks for sign-in.
- **Content:** a guest's chat goes through the content screen like everyone's; for guests
  the would-block verdict rejects even while the screen is in monitor mode, since there is
  no account to hold responsible.
- **Conversion:** a "Sign in to save your game" banner after the first vote and on game
  over. Signing in moves the guest's game to the account (`ownerEmail` rewrite), counts the
  guest's spend against the account's signup credit, and links the device as today.
- **Abuse limit:** the multi-account tracking (device id, 12h same-IP inheritance) slows
  repeat guests but is beaten by a cleared browser on a VPN (the 2026-10-29 ring). The
  global daily guest budget is what actually bounds the cost, so the worst case is that
  budget a day.
- **Cost of building it:** `auth()` + `session.user.email` is in every server action, so the
  actor helper touches many files. Ship starter games for signed-in players first, read
  their numbers, then add guest play as its own step.

### Open questions (Alex)

1. Guest play: go ahead after the signed-in version ships? With what per-guest cap and
   daily guest budget?
2. Hints: is the first set the right one? Anything to add for the villager's first night?
3. Languages: English templates only at launch, or the three themes in the top new-user
   languages too?

---

## Track 2 — Multiplayer

Design: `docs/plan-multiplayer.md` (settled 2026-09-30/10-01, not built). What changes
because of the other tracks:

- **The invite link is the referral link** (track 4): a friend who joins through it and
  plays gets the signup credit, and the host gets the referral credit.
- **Billing decision 13** is written for free allowances; under credits each seat pays from
  its own credits by default, or the host pays for everyone. Re-decide when track 4 lands.
- **Starter templates make good lobbies:** "Play with a friend" on a starter card creates a
  shared game from the template, so the host does not have to fill the form either.

Build order (from the plan, smallest shippable steps first): the privacy split (private
docs, action responses without game data) → Firebase custom tokens + `onSnapshot` → LOBBY
and seat claims → the queue as the lock + send cooldown → vote by agreement and multi-human
nights. The privacy split is the prerequisite and is worth doing even before the rest.

---

## Track 3 — UI (decide later)

No overhaul planned. Two places matter to new players and are in track 1 anyway: the
`/games/start` cards and the first screen of the game page. Design them in the
claude.ai/design Phase Controls project (canvas fdd44458…) with the existing themes. Revisit
a wider refresh after track 1's numbers come in.

---

## Track 4 — Free/paid tiers → one-time credits

### Decision direction

- **New users get a one-time credit** (`config/limits.signupCreditUSD`, $5 to start)
  instead of the $5/day refill. 95% of players never spend $5 in total; the change only
  reaches people who play a lot, and those are the ones who might pay.
- **Regulars are not cut off.** Users with real history (proposal: 3+ active days or 5+
  games in the last 180 days, from `requestStats`) get a one-time grandfather grant
  (proposal: $15) and a message explaining it. About 20–30 people.
- **Referral credits:** a personal invite link; when the invited friend finishes the first
  game, both get a credit (proposal: $2 each, a cap per month). "Finishes a game", not
  "signs up", so a second account earns nothing by itself. Device/IP linking
  (`devices`, `ips`) keeps one signup credit per browser.
- **One tier.** "Paid" becomes "has a balance". The Upgrade switch on /profile goes away.
  Credits and purchased balance are separate fields; credits are spent first, at cost
  (no 15% markup), purchased balance as today.

### Model groups (the bands, renamed)

The four free-tier bands stay as cost groups, because they protect a $5 credit from one
game of expensive models and keep Random cheap:

| Group | Measured cost per bot turn | Rule while on credits |
|---|---|---|
| Light | ≤ 0.3¢ | unlimited |
| Standard | ≤ 1¢ | up to 3 bots |
| Premium | ≤ 2¢ | 1 bot |
| Elite | > 2¢ | purchased balance only |

(These are today's `FREE_TIER_TURN_COST_BANDS` in `app/ai/ai-models.ts`; the explicit overrides,
Sonnet 5.5 paid-only and GPT-6.1 Terra 3 bots, become group placements.) The picker shows
the group as a badge, "Random" draws from Light + Standard only, and the per-game caps apply
while a game is paid from credits.

### What goes away

`assertFreeSpendWithinLimit` (daily $5 / monthly $20 caps, per-device daily budgets) becomes
a balance check: credits + purchased > 0. The before-ask hook, `recordSpend`'s transaction
and `requestStats` stay; `dailySpend` ledgers stop mattering. The 5-games-a-day limit stays
as abuse protection.

### Open questions (Alex)

1. Credit amounts: signup $5? Grandfather grant $15? Referral $2 + $2?
2. Do credits expire?
3. Grandfathered regulars: a one-time grant, or a small monthly refill (a "founder"
   perk)?
4. Under credits, should multiplayer guests pay for their own seat or the host pay for all?

---

## Sequencing

1. Track 1: templates script (+ voice clips) → `createStarterGame` → `/games/start` +
   routing → helper mode → report. Ship, read two weeks of first games. Then guest play
   if Alex decides for it.
2. Track 4 can start alongside track 1's measurement window (it is mostly server-side).
   Announce it in News and on Discord before switching; grandfather grants go out the same
   day.
3. Track 2: privacy split first, then the rest of the multiplayer plan.
4. Track 3 when the numbers say the first screen is the next leak.
