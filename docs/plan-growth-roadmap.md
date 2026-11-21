# Plan: growth roadmap (starter games, multiplayer, UI, credits)

Status: draft, 2026-11-20. Nothing implemented. Order agreed with Alex: (1) starter
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
2. 3–4 cards: art, title, one-line hook ("A storm traps seven guests at a mountain inn. One of
   them is not what they seem."). A "Your name" field, prefilled from the account's first
   name. "Play". Below: "Create your own game" → the existing form.
3. Play → the game page opens in DAY 1 DISCUSSION with the opening story and every
   character's introduction already in the chat, portraits already drawn, and the role card
   on top. The composer is live immediately.
4. Light guidance on the first game only: the GM's lines say what to do next ("Ask
   someone a question, or press Vote when you've heard enough"), a one-time hint points at
   the Vote button, and the night screen explains the role's action in one line.

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
- Optional later: the intro voice lines as stored audio, so the first minute has voices
  without TTS calls.

`scripts/build-starter-game.ts --theme "…" --id inn-storm`: runs the normal preview
pipeline with the starter table, draws the portrait sheet, creates a throwaway game, runs
the introductions, and copies all of it into `starterGames/inn-storm`. Alex reads the
result before it goes live (`status: draft | live`). Cost: one preview + one sheet + six
intros per template, once.

### The starter table

- **7 players: the human + 6 bots.** 2 werewolves, a doctor and a detective (no maniac),
  2 villagers. Small enough that day 1 is a few rounds, big enough that one lucky vote
  does not end it.
- **Human role:** villager, doctor or detective, never a wolf in the first game (lying to
  six models is the hardest job and the worst first impression). Detective is probably
  the most fun first role: there is a night action and a reveal. Open question below.
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

### Open questions (Alex)

1. Human role in the starter game: always detective, or random among villager/doctor/detective?
2. How many templates at launch, and which themes? (Suggest 3: a classic village, a
   locked-room mystery, one sci-fi.)
3. Pre-recorded intro voices now, or later?
4. Should a signed-out visitor be able to play a starter game before signing in? Biggest
   lever on the "signed up but never played" third, but the free budget would then need a
   per-device guard only. Proposed: no, revisit after the numbers.

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

1. Track 1: templates script → `createStarterGame` → `/games/start` + routing → guidance
   lines → report. Ship, read two weeks of first games.
2. Track 4 can start alongside track 1's measurement window (it is mostly server-side).
   Announce it in News and on Discord before switching; grandfather grants go out the same
   day.
3. Track 2: privacy split first, then the rest of the multiplayer plan.
4. Track 3 when the numbers say the first screen is the next leak.
