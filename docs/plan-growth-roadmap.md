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

## Decisions and open points, 2026-11-21 (Alex)

- **Pre-generated vs live.** Everything before the player's first message is pre-generated
  and stored on the template: the opening story, the introductions, their voice clips, the
  portraits (several sets) and the welcome scene. Generation starts when the player starts
  playing: bot replies, live voice, the GM's illustrations.
- **Art styles (built 2026-11-21):** a template has three sets in DIFFERENT styles, e.g.
  one anime, one realistic, one other (Alex: variety, not one consistent look). Each is
  drawn straight onto the template by
  `scripts/draw-starter-style.ts <templateId> --label anime --style "…"`: the cast's
  portraits and that style's own welcome/night scenes, two image calls (~$0.11 measured).
  A new game gets one style at random for the whole cast, with its scenes and its style
  text, so the GM's live illustrations match. The player can switch any character to
  another style's portrait (a mixed cast is their choice). The source game's own portraits
  are round 0 and are never picked once a styled round exists; three styled draws push
  them out.
- **Intro voices and the cinematic start (built 2026-11-21):**
  `scripts/record-starter-voices.ts <templateId>` records the opening story and the six
  introductions once (MP3 via ffmpeg, measured: a 16 s introduction = 97 KB, $0.0025). A
  line that names the human placeholder is skipped and read live, so keep the story and
  the introductions free of the human's name. On the first open the role card shows, and
  closing it opens cinematic mode on the opening story with voices on.
- **Browsers are not restricted for guests** (Alex, 2026-11-21): Brave, VPN and
  blocked-signal visitors may play as guests like everyone else. The one-game,
  one-day-and-night limit and the daily guest budget are the protection.
- **Order:** finish the pre-set games (voices, cinematic start, random set), then the helper
  hints.
- **Anonymous players are users.** Every visitor who starts a game without signing in gets
  a record (`guests/{guestId}`): first seen, device id, fingerprint, IPs, edge geo, system
  timezone, every game started (the first one included), how far each got, and, if they
  sign in, the account they became (`convertedTo`). Every anonymous game start is also a
  `starter_game_created` feature event with `guest: true`. The report reads guests and
  accounts as one funnel: landed → started a game → wrote a message → first vote → first
  night → signed in → second game.
- **Fingerprint data: nothing has been collected so far.** `devices/{id}` holds the cookie
  id, the emails and IPs seen on it and the edge geo (the IP's timezone, not the system's).
  The browser signals (canvas, GPU, screen, system timezone, languages) were designed on
  2026-10-29 and never built, so there is nothing to analyse yet. The two-week wait is only
  needed to tune a FUZZY match for accounts (credits). Guests can be linked from day one by
  an EXACT match on the strong signals, because a false match there costs a sign-in prompt,
  not a refusal. Known limit: phones of one model in one timezone look identical, so on
  mobile the exact match is combined with the IP.
- **Browser signals are collected since 2026-11-21 (built, on `develop`):** stored per
  device with a full hash and a machine hash, indexed by machine in `fingerprints/`, monitor
  only. First real reading: Brave hides the graphics card and randomizes canvas, screen,
  cores and memory, so a Brave visitor is recognisable as Brave but not as a machine; for
  such browsers the IP rule is the only link. Alex's call: good enough. Someone who goes
  to that length gets one more limited guest game, and guests have no role choice, no
  table size and no model choice anyway.
- **"Play now" (decided):** the three story cards sit on the landing page; one click starts
  that story.
- **What a guest gets (decided):** one game, day 1 and night 1, no rewinds and no resets.
  The morning of day 2 asks for sign-in: free, the game continues on the account, the other
  stories open up.
- **Credits (track 4), direction confirmed:** free and paid merge; a new account gets $5
  once. **Discord bonus:** extra credits for joining the Discord server and asking Marlow
  (a personal claim code from /profile, posted to the bot; one claim per Discord account
  and per game account; Marlow already reads this Firestore project).
- **Multiplayer:** signed-in users only, built last.

## Build state, 2026-11-21 (evening)

Built on `develop`, not pushed:

- **Lobby:** the ready-made stories stay above the game list for every signed-in player; a
  card continues the unfinished game from that story or deals a new one.
- **Guest play:** story cards on the landing page, one click, no sign-in. A guest is a
  `users` row with `guest: true`; one game; day 1 + night 1; "Sign in to play Day 2" in
  place of Next Day; signing in moves the game to the account. Caps in `config/limits`:
  `guestSpendUSD` 1, `guestGlobalDailySpendUSD` 5 (Alex has not confirmed the numbers),
  `guestOncePerDevice` on: a known device without its guest cookie (cleared cookies, private
  window) is asked to sign in, never given a second guest or the earlier game (Alex,
  2026-11-21). Content screen in enforce for guests. Details: CLAUDE.md,
  "Guest play".
- **Decided 2026-11-21:** the fingerprint does not reopen a guest's game (same-model phones
  share one); the `ww_guest` cookie does. After the guest's game, the other stories read
  "Sign in to play".
- **Order changed (Alex, 2026-11-21):** the credits switch (track 4: $5 once at sign-up, no
  daily refill, then pay) moves up to ship WITH guest play, before helper hints.

Owed before guest play goes live:

- The sign-in hand-over (`claimGuest`) has not been run with a real Google/GitHub sign-in.
- Marlow's daily digest counts every `users` row as a signup: it must skip `guest: true`
  (and report guests separately).
- Templates are still drafts; `--publish` makes the landing cards appear in production.

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

## Build state, 2026-11-23

Still on `develop`, unpushed. All three templates are DRAFTS (local server only).

- **Three stories.** `tavern` (The Last Lantern), `starship` (Meridian Is Off Course),
  `ninja-academy` (Night at Moonshade Academy). Each: 8 players, 2 werewolves, doctor +
  detective, three art styles, recorded voices. The two new source games were created by
  script (`scripts/make-starter-source.jest.ts`, forms in `scripts/starter-sources/`), then
  edited by hand (`snapshot-starter-game.ts --export-text / --import-text`): opening stories
  rewritten in the tavern's shape, a duplicate security officer turned into the medic
  (starship), a duplicate transfer student turned into the stealth instructor (ninja).
- **Languages.** A Language picker next to the name on the start screen (landing page and
  lobby). Every template is translated into the 13 other game languages (story, backstories,
  introductions) and voiced in each: 8 clips per language per story. Names stay Latin.
- **Open.** Nobody but the model has read the translations: a native read of at least one
  or two languages before publishing. The anime welcome scene of `ninja-academy` has a
  small blond, headband-wearing student in the crowd that reads close to a known anime
  hero (drawn twice, both times); the card shows the watercolor scene instead, and the
  anime scene should be redrawn or dropped before going live.
- **Cost of this build:** about $7 (two source games, seven style draws, 39 translations,
  ~330 voice clips).

## Build state, 2026-11-25: credits, sign-up check, Discord claim

Still on `develop`, unpushed. Decided by Alex on 2026-11-25:

- **Existing players get $5, once, and that is it.** No grandfather grant, no refill.
- **Out of credits:** the message offers the Discord server ("ask Marlow") for $5 more,
  or a top-up.
- **A new account of a person who already has one must not get $5 again.** Detection is
  switched on, not monitored first.
- **Marlow reports guests too:** every guest game creation, not every visit.

Built (details in CLAUDE.md, "Free credits"):

- `users.credits`, spent at cost by `recordSpend`; the guard refuses at zero. The daily,
  monthly and per-browser caps do not apply under credits; the platform-wide daily ceiling,
  5 games a day and the model bands stay. `config/limits.creditsOn: 0` goes back to the caps.
- **Two wallets, on purpose.** Free credits are a separate number from the purchased
  balance: free credits keep the model bands (so $5 is not gone in one game of an expensive
  model), are spent at cost with no markup, and Marlow can still tell who paid. The Free /
  Paid switch on the profile stays for now; a top-up moves the account to Paid as before.
- A Paid account can now open a game created on the Free tier, so running out mid-game and
  topping up continues that game.
- **Sign-up check** (`decideSignupCredit`). Denied: a second account on the same browser id;
  two signs together (machine fingerprint, same IP within 7 days, numbered sibling name);
  the machine alone only for a specific PC seen within 72 hours. One weak sign alone is
  granted and flagged. Run read-only against the October ring: `reqaccv2` and `reqaccv5`
  both come out denied (same browser).
- **Discord claim.** A personal code on the profile page and in the popup; `/credits
  code:WOLF-…` in the server is answered by the game itself as the Marlow bot (an HTTP
  interaction, no bot process). Once per game account and once per Discord user.
- **Marlow** (`~/projects/marlow`, `handlers/werewolf_stats.py`, commit b629e5f; Marlow runs from its working tree, so this is live from its next 05:05 UTC run, and its nightly backup pushes it):
  guests are out of the sign-up counts; the digest lists each guest game and the day's
  credit grants, denials (with the reason and the linked account), flags and Discord claims.

Known limits, said plainly:

- **Apple hardware and phones.** Two MacBooks of one model, or two phones of one model, in
  one time zone have the same fingerprint. A cleared browser on a VPN on such a machine is
  NOT denied (it is flagged, and Marlow lists it); denying it would refuse honest newcomers
  on the most common hardware. On a Windows or Linux PC with a named graphics card it IS
  denied within 72 hours. There is no production fingerprint data yet (collection ships with
  this deploy), so the rule is set by reasoning, not measured; read the flags for two weeks
  and tighten.
- **Old accounts of one person each get $5.** The ring's six accounts are "existing" and are
  not checked. A blocklist (plan-multi-account-linking.md §1) is the answer if that matters.
- **A new Discord account is a new claim.** The claim is once per Discord user; nothing
  checks how old the Discord account is (the row records who claimed).

Owed before going live:

1. Alex signs in locally and looks at the profile page, the popup and a real game running
   out (set `credits` low with `scripts/credits.ts grant <email> -4.9`).
2. Deploy, then `scripts/discord-credits-setup.ts endpoint …` and `register`, then try
   `/credits` in the server. Post the how-to in Discord and a News entry.
3. `scripts/credits.ts backfill-stems --write` (adds `handleStem` to recent accounts so the
   sibling rule sees them).
4. The guest → account sign-in hand-over is still untested with a real OAuth sign-in.
