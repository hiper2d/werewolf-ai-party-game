# Plan: growth roadmap (starter games, multiplayer, UI, credits)

Status: 2026-11-21: track 1's first step is built (templates, `createStarterGame`, the start
screen, the starter-game limits; committed, not yet reviewed or deployed). Voice clips,
helper mode, the report and everything else below are not built. Order agreed with Alex: (1) starter
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
  draft. **Several variants per character** (3 sheet rounds), drawn at build time, so the
  player can still pick a different portrait for anyone, including their own seat, at no
  cost. Picking a variant and reframing stay; redraw is off (see Limits below).
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
- The welcome scene, drawn once with the sheets. It opens cinematic mode and is the style
  reference every later illustration of the game is drawn against.
- **Illustrations stay live and decided by the Game Master** (Alex, 2026-11-20): the night
  illustration and the dramatic mid-day one are drawn during the game from what actually
  happened, exactly as in a normal game. They are the only image calls a starter game
  makes (a few cents each, a handful per game). Only the portraits and the welcome scene
  are pre-drawn.

**How a template is made (built 2026-11-21): a snapshot of a real game**, not a separate
generation pipeline. Alex creates the game with the normal form (7 players, 2 werewolves,
Doctor + Detective, a distinctive one-word name for himself such as "Rowan"), edits the
cast on the preview, lets the characters introduce themselves, rerolls portraits until
every character has good candidates, and then runs
`scripts/snapshot-starter-game.ts <gameId> --id tavern --title "…" --hook "…"`. The script
refuses a game that is not exactly "day 1, right after the introductions, nobody has
talked", copies the cast, the story, the introductions and every image doc into
`starterGames/tavern` as a draft, and `--publish tavern` makes it live. Everything the
form, the preview editor and the portrait tools can do is available for curating a
template, and there is no second pipeline to keep in step with the first.

What is NOT copied from the source game: roles and models (dealt per game), the bots'
private thinking on their introductions (written under another role deal), and the turn
tails (rebuilt for the new game's roles and the player's name). The source game's human
name is the placeholder: it is replaced, as a whole word, in the story, the bot stories and
the introductions, and the human's portrait docs are renamed to the player's name.

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
- **Models: the cheapest group only** (Alex, 2026-11-20). Today that is eight models at
  0.08-0.20¢ a bot turn, all with 1,100+ measured turns: GPT mini, DeepSeek Flash, Qwen
  Flash, GLM Flash, Mistral Small, MiniMax, Gemini Lite, Claude Haiku. Six of them sit at
  the table, one per bot, so every character is a different provider. GM: one of the group
  that is allowed as Game Master. Stored on the template, re-checked against the group at
  creation (a model that left the group or the catalog is replaced by another member).
- **Day 1 is short:** a lower auto-vote ceiling for starter games (the existing
  bot-message-count ceiling, set per game) and the GM's "you can vote now" line after the
  first round.

### Limits in starter games (Alex, 2026-11-20)

A starter game is the free sample: nothing in it can cost more than the cheap table it was
built for.

| | Starter game | After registration, in games made with the form |
|---|---|---|
| Models | the cheapest group only; the model picker on a bot or the GM lists only that group | the other groups, by the usual per-group rules |
| Rewinds: delete a message, trim after a message, replay the night | off | on |
| Portraits | pick among the pre-drawn variants, reframe | redraw / reroll as today |
| Illustrations | drawn live when the GM decides, as in any game; no manual redraw | the same |

- "Registration" matters once guest play exists: a guest gets only the left column. A
  signed-in player's starter game follows the same left column (it is the same cheap,
  pre-drawn game), and the right column is what the form gives them. To confirm with Alex:
  whether a signed-in player should get rewinds inside a starter game.
- Recovery is not a rewind and stays on for everyone: the Retry button on an error banner
  (a provider failed, a bot timed out), retrying a failed turn with a different model, and
  reassigning a refused provider's bots, all limited to the cheapest group here.
- Enforced on the server, not only hidden in the UI: `updateBotModel`,
  `updateGameMasterModel`, `retryWithModelOverride`, the delete/trim actions, `replayNight`
  and the avatar reroll check `game.starterTemplateId` and refuse.
- Image spend in a starter game is the GM's illustrations only (no sheet, no scene, no
  redraws); the report shows it per game.

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

### Playing without signing in (after account linking, track 0)

The "signed up but never played" third suggests the sign-in step itself loses people. A
guest could play one starter game before signing in:

- **Identity:** a guest user `guest:<deviceId>` (the existing device-id cookie +
  localStorage UUID), created when a signed-out visitor presses Play. Server actions get
  the actor from one helper that returns the session email or the guest id; game access
  checks compare against it.
- **Only starter games,** with the limits above: cheapest group only, no rewinds, no
  redraws. The intros and their voices are pre-recorded. The form, the
  other model groups and rewinds are what signing in unlocks, and the game says so where
  those controls would be ("Sign in to change models beyond this set").
- **Cost guard:** measured 2026-11-20, a free game costs a median $0.39 and $1.54 at p90
  (11 bots, with portraits and an intro round). A starter game skips the portraits and the
  intros, has 6 bots on cheap models, so expect well under $0.50. Guards: a per-guest cap
  (e.g. $1), one guest game per device and per IP per day, and a global daily guest budget
  in `config/limits` (e.g. $5/day); past it the Play button asks for sign-in.
- **Content screen enforced for guests** (Alex, 2026-11-21), whatever `jevScreenMode`
  says for accounts. An anonymous visitor has nothing to lose, so the guest path is where
  abuse will be tried first (free model access through the bots, jailbreaks, content that
  gets the platform keys flagged):
  - `would_block` (the hard flags) rejects, as in enforce mode.
  - Stricter than accounts: a `grey` verdict whose reason is `jailbreak` or `sexual` rejects
    too. The composer keeps the draft and shows the notice, as today's rejection does.
  - Fail closed: when both judges fail, a guest's message is not sent ("try again"), where
    an account's goes through unscreened.
  - Two rejected messages end the guest's free play: the game stays, and continuing needs
    a sign-in.
  - Guest input is the name and the chat only (vote reason and nothing else typed), each
    with today's length limits, and the 5 s send cooldown from the multiplayer plan.
  - Every guest verdict is a `jevScreenCalls` row with `guest: true`, so the report shows
    what guests try, separately from accounts.
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

## Track 0 — Account linking (prerequisite for guest play and credits)

Design: `docs/plan-multi-account-linking.md` (agreed 2026-10-29, **not built**: today the
only defences are the browser id cookie and the 12h same-IP rule, and a fresh browser on a
VPN passes both). Alex, 2026-11-21: build it, and cap free games.

Why it moves up: both guest play (no email at all) and one-time credits ($5 per new
account) pay out per identity, so the value of a new identity has to be near zero before
either ships.

- **Phase A, start now, alongside track 1:** fingerprint collection in monitor mode (canvas
  hash, GPU string, screen, OS, browser, timezone, languages, cores/memory, raw values),
  `deviceLinks` rows, the Marlow alert, the blocklist, the privacy line. It needs about two
  weeks of data before a threshold can be chosen, so it must start before it is needed.
- **Phase B:** the pairwise analysis against the cookie id (`scripts/fingerprint-analysis.ts`).
- **Phase C:** fingerprint links enforced: a keyless browser that matches a known one
  inherits its budget. Gate for guest play and for the credits switch.

What a fingerprint is and is not: it survives a cleared browser, a private window and a
VPN, which is everything the October ring used. It is not unerasable: another device or an
anti-fingerprint browser gives a new one, and identical hardware (the same phone model)
can give the same one. So it links identities; it never refuses by itself, and the caps
below stay as the ceiling.

**Caps on free play** (config/limits, all adjustable):

| Cap | Proposed | Stops |
|---|---|---|
| Per guest, lifetime | 1 starter game, $1 | one visitor playing for free forever |
| Per device and per IP, per day | 1 guest game | a private window in a loop |
| All guests together, per day | $5 | everything else; past it, Play asks for sign-in |
| Signup credit, per linked identity | once | a second account on the same browser/fingerprint |
| Games per day, per account | 5 (today's limit) | runaway use |

## Sequencing

1. Track 0 phase A (collection, monitor) and track 1 start together.
2. Track 1: templates script (+ voice clips) → `createStarterGame` → `/games/start` +
   routing → helper mode → report. Ship for signed-in players, read two weeks of first
   games.
3. Track 0 phases B and C, then guest play (with the caps above).
4. Track 4 after track 0 phase C. Announce it in News and on Discord before switching; grandfather grants go out the same
   day.
5. Track 2: privacy split first, then the rest of the multiplayer plan.
6. Track 3 when the numbers say the first screen is the next leak.
