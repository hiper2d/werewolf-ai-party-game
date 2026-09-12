# Plan: complete user-spend tracking + a configurable $5/day free-tier cap

Status: implemented 2026-09-11 (app + `@hiper2d/ai-agents` 0.3.0/0.3.1). Sections 1-9 describe
what shipped; the "Shipped vs. plan" note at the end lists the deltas. Requested by
Alex after a traffic spike on 2026-09-11 drained the Gemini prepaid key to $0 with no warning
and no way to see where the money went.

Goal, in Alex's words: "make sure that all user's AI spendings are tracked - games, voice,
previews, images. All." Then cap each free user at **$5 of platform spend per UTC day**,
make the number configurable, and report it.

## Decisions (Alex, 2026-09-11)

1. **$5/day on the free tier, no exceptions.** Every AI spend counts: bot turns, Game
   Master turns, previews, avatars, illustrations, TTS, STT. The moment the day's total
   reaches the cap, every further spending call is refused with a clear error until UTC
   midnight. A game in progress stops at its next AI turn and resumes tomorrow. There is no
   "let the running game finish" exemption.
2. **The cap is configurable at runtime**, not a compile-time constant.
3. **Keep the 5 games per calendar day cap** as an independent second rule.
4. **Remove the chat-reset limit** (`CHAT_RESETS_PER_GAME_DAY`). With a dollar cap, resets
   cost money and therefore count; no separate rule needed.
5. **Keep on free:** the price-banded model list with its per-game bot caps, and the single
   portrait reroll per game (`FREE_TIER_AVATAR_REGENS = 1`, already shipped).
6. **Keep paid-only:** night replay (already shipped). Paid tier has no daily or monthly
   cap; the prepaid balance is its only limit.
9. **$20 monthly ceiling on free-tier spend**, configurable like the daily cap. The same
   guard checks both windows; whichever is exhausted first refuses the call. Replaces the
   inherited voice-era $5 monthly cap.
7. **Mid-game illustrations stay free for everyone.** The "planned paid perk" comment in
   `illustration-generation.ts:24` is resolved: they are covered by the daily cap.
8. **The budget mechanics move to `@hiper2d/ai-agents`** as a storage-agnostic module,
   reusable across projects. Firestore, tiers and game bookkeeping stay in the app.

## Context: what the spike looked like

| | prior 48h | 2026-09-11 (20h) |
|---|---|---|
| games created | 6 | 25 |
| distinct owners | 5 | 10 |
| `totalGameCost` | ~$4 | $13.49 |

Gemini prepaid balance over the same period: $20.59 on 09-01, $11.55 on 09-08, $8.10 on
09-09, $6.57 on 09-10, effectively $0 on 09-11 before a manual $25 top-up. AI Studio's own
month-to-date figure was $20.56, so the drain was real.

## Problem

### 1. Two billing paths exist, and only one of them is observable

**Path A (atomic, correct, observable).** `commitUsageAtomically`
(`app/api/cost-tracking.ts:104`) charges the user, increments the game's cost fields, and
writes one `requestStats` row, all in a single Firestore transaction. Used by
`recordGameMasterTokenUsage` and `recordBotTokenUsage`, which between them cover every bot
turn and GM turn from ~10 call sites in `bot-actions.ts`, `night-actions.ts` and
`bot-selection.ts`.

**Path B (ad-hoc, no stats row, not atomic).** Five places call
`updateUserMonthlySpending` (`app/api/user-actions.ts:53`) directly:

| what | call site | writes a `requestStats` row? |
|---|---|---|
| game preview / story generation | `app/api/game-actions.ts:362,364` | no |
| avatars (+ rerolls, abandoned runs) | `app/utils/avatar-generation.ts:433,435` via `billImages` | no |
| mid-game illustrations | `app/utils/illustration-generation.ts:199,201` | no |
| TTS | `app/api/tts-actions.ts:75` | no |
| STT | `app/api/stt-actions.ts:71` | no |

The user *is* charged correctly on both paths. `users.spendings` is complete. What is
missing is the `requestStats` row, and `requestStats` is what every cost report reads.

**Measured consequence (2026-09-11):** `requestStats` reported **$7.14** of Gemini spend
for Sept 1-11. The provider console reported **$20.56**. The missing ~$13 is the image
pipeline plus preview/story generation, both Gemini calls on path B. Two thirds of Gemini
spend was invisible to every reporting tool we have.

### 2. The one spend guard is wired to voice only

`assertFreeTierSpendWithinLimit` (`app/api/user-actions.ts:230`) caps free spend for the
current **month** at `FREE_TIER_LIMITS.MONTHLY_SPEND_USD` ($5) and is called from exactly
two places: `stt-actions.ts:52` and `tts-actions.ts:55`. Nothing caps LLM or image spend.
Both voice sites also gate on the **game's** creation tier, not the user's current tier.

### 3. A game count is the wrong meter

Per-owner cost on 2026-09-11 ranged from **$0.01 to $2.98**. A 12-player game on Gemini Pro
with illustrations costs roughly fifty times a small game on cheap models. A count cap
blocks the cheap player at the same point as the expensive one, and needs a separate rule
for every spend path that does not create a game. A dollar cap needs none: if it costs
money, it counts.

### 4. Preview spend belongs to no game

`previewGame` charges the user but no game exists yet, so the cost lands in no
`totalGameCost`. Summing `totalGameCost` across games under-reports platform spend.

### 5. Observed abuse signature

Three accounts sharing a 3-character local-part prefix were created within 5 hours on
2026-09-11 with 5, 5 and 3 games. Five is `GAMES_PER_CALENDAR_DAY`. That is one person
re-registering after hitting the count cap. Multi-account detection is out of scope here.

## Design

### 1. Split: what goes in the library, what stays in the app

The library is stateless and provider-facing. It knows prices and reports `costUSD`; it
does not know users, tiers or databases. The budget module keeps that shape.

**Library (`@hiper2d/ai-agents`, new `src/budget/`):**

- `SpendWindow = 'day' | 'month'` and `periodKey(timestamp, window)` (UTC `YYYY-MM-DD` /
  `YYYY-MM`), generalizing the app's `formatPeriod`.
- Pure ledger reducers over plain objects with generic named buckets:
  `applySpend(ledger, { period, amountUSD, bucket })` returning a fresh ledger. The daily
  ledger is a single-period object that is **overwritten** when the period changes (O(1)
  doc forever); the monthly ledger is the existing array shape.
- A verdict function: `evaluateBudget(ledger, { limitUSD, window }, now)` returns
  `{ allowed, spentUSD, remainingUSD, resetsAt }`. No throwing, no I/O. Callers with
  several windows (the app has day and month) evaluate each and take the first refusal.
- `BudgetExceededError` in the existing error taxonomy (`src/errors.ts`) carrying
  `{ limitUSD, spentUSD, resetsAt, window }`, so consumers can render it instead of
  treating it as a provider failure.
- `SpendKind` string union (`'llm' | 'image' | 'tts' | 'stt'` plus free-form) for stats.
- Optional `SpendStore` interface (`read(subject)`, `commit(subject, reducer)`) with an
  `InMemorySpendStore`, for projects that do not need cross-document atomicity.

**Not in the library:** the Firestore transaction, user docs, free/paid tiers, the paid
markup, game cost fields, `requestStats`, error copy, UI. The contract is "the library
gives you reducers and a verdict; you apply them inside whatever transaction you own."

**Phase 2 (after the app ships): agent-level hook.** `AgentFactory` accepts an optional
`BudgetPolicy = { beforeAsk(subject), afterAsk(subject, usage) }`. Every LLM and voice call
through any agent is then guarded and recorded whether or not the call site remembered.
The bug class fixed by this plan is "forgotten call sites"; the hook eliminates the class.
It is phase 2 only because it means threading the billing subject through the agent
constructors at the ~10 game call sites, which is a separate refactor.

Release order: library first (pure module, unit-tested, no behaviour change for existing
consumers), tag and publish, then `npm i @hiper2d/ai-agents@X.Y.Z` here.

### 2. One chokepoint in the app: `recordSpend`

Collapse both billing paths into a single function, the only place in the app that moves
money. Lives in `app/api/cost-tracking.ts` (or a new `app/api/spend-ledger.ts`).

```ts
export async function recordSpend(input: {
    userEmail: string | undefined;
    costUSD: number;
    kind: 'bot' | 'gm' | 'preview' | 'image' | 'tts' | 'stt';
    gameId?: string;              // absent for previews
    modelId?: string;             // for the stats row
    botName?: string;
    usage?: TokenUsage;
    imageCount?: number;          // image billing is per image, not per token
    gameUpdate?: (game: Game) => Record<string, any> | null;
}, timestamp?: number): Promise<void>
```

In one transaction (a plain user-doc transaction when there is no `gameId`):

1. Read the user doc. Paid tier: deduct balance + `PAID_TIER_MARKUP`, throw before any
   write on insufficient balance. Unchanged, just centralized.
2. Apply the monthly reducer (existing `spendings` shape) and the new daily reducer.
3. Write one `requestStats` row carrying `kind`.
4. Apply the caller's `gameUpdate` to the game doc when there is one.

Spend that already happened is **always recorded**, even when it lands past a cap. The
caps are enforced *before* the call (section 4); refusing to record money that was
already sent to a provider would only hide it from the ledgers and the reports, which is
the very bug this plan fixes. (An earlier draft re-checked the cap inside the transaction
and refused the write; that was dropped for this reason.)

Then:

- `commitUsageAtomically` becomes a thin caller (`kind: 'bot' | 'gm'`).
- The five path-B sites call it instead of `updateUserMonthlySpending` + `recordGameCost`.
- `billImages` collapses into a `kind: 'image'` call.
- `updateUserMonthlySpending` stays exported for admin/backfill only, with a comment saying
  it is not the way to bill a user.

### 3. The daily bucket on the user doc

```
dailySpend: {
    period: '2026-09-11',              // UTC, YYYY-MM-DD (the library's SpendLedger key)
    totalUSD: 3.7412,                  // paid amounts include the 15% markup, as in `spendings`
    buckets: { free: 3.7412, paid: 0 }, // by the tier that was billed; a zero bucket is absent
    limitHits: 0                       // times the guard refused this user today
}
```

The ledger part is the library's `SpendLedger` verbatim (`applyDailySpend` in
`spending-utils.ts` wraps `applySpend` and only carries `limitHits` across same-day
updates, zeroing it when the day rolls).

Overwritten, not appended, when `date` is not today. History lives in `requestStats`
(180-day TTL) and Marlow's snapshot tape. A denormalized field costs one read the billing
transaction already does; a `requestStats` aggregation per call would not.

### 4. The pre-call guard

```ts
export async function assertFreeDailySpendWithinLimit(userEmail: string): Promise<void>
```

- Resolves the **user's current tier** (fixes the `getGameTier` mismatch in the voice
  paths). Paid tier returns immediately.
- Reads `dailySpend` (absent or stale `date` counts as $0) and the current month's
  `freeAmountUSD` from `spendings`.
- Calls the library's `evaluateBudget` for the day, then the month; on either refusal
  increments `dailySpend.limitHits` and throws the app's `FreeSpendLimitError` (section 6)
  carrying which window refused.
- Replaces `assertFreeTierSpendWithinLimit`, which is deleted along with its monthly
  voice-only semantics.

Call sites, all **before** the AI call, and every one of them:

| where | how |
|---|---|
| every bot turn, GM turn and preview stage | **the agent pre-ask hook**: `app/ai/agent-factory.ts` installs `setBeforeAskHook` (library 0.3.1) once; the library runs it before every `askText` / `askWithZodSchema` with the agent, and every call site already stamps `agent.userId`. No call site was touched and none can forget the check |
| game preview and creation | explicit call in `previewGame` (next to the games/day check) and `createGame` (the avatar draw follows creation) |
| avatar generation, retry and reroll | `avatar-actions.ts` server actions, before the claim |
| preview illustration drafts | `avatar-draft-actions.ts` |
| mid-game illustrations | `illustration-generation.ts`: a refusal is a quiet skip (warn log), never a game error |
| TTS / STT | replaced the voice-only monthly guard |

The pre-call guard is the only refusal point; `recordSpend` never refuses money that was
already spent.

### 5. Concurrency: bounded, and stated

The pre-call guard can only see committed spend, so N parallel calls can each read $4.99
and pass. Their spend is recorded in full (section 2), so the ledgers stay honest and the
next guard refuses. The overrun is bounded by the cost of the calls in flight at the
moment the cap is crossed: cents for a bot turn, up to a few tens of cents for an avatar
batch. Document the bound, keep the games/day cap as a burst brake, move on.

### 6. The error, and how the user sees it

- New `FreeSpendLimitError` in `app/api/errors.ts`, built from the library's
  `BudgetExceededError`, with a stable phrase in its message so it survives the string
  round trip through `game.errorState`, plus `isFreeSpendLimitError(text)` next to
  `isInsufficientBalanceError` (same pattern, regex on the phrase).
- Daily message: **"You've used today's free $5 of AI. Come back after midnight UTC, or
  add funds on your profile page to keep playing now."**
- Monthly message: **"You've used this month's free $20 of AI. It resets on the 1st, or
  add funds on your profile page to keep playing now."**
  Amounts come from config. The client renders the reset time in the user's local zone.
- `GameChat.tsx` gets a banner variant modeled on the insufficient-balance one
  (`GameChat.tsx:2011`): title "Today's free allowance is used up", the message above,
  an "Add funds" link to the profile, and Retry kept visible so the paused game reads as
  paused, not broken. The phase strip already shows "Paused" whenever `errorState` is set.
- `games/newgame/page.tsx` and the avatar, illustration and voice surfaces show the same
  message; they already classify insufficient-balance errors, so this is one more branch.
- Server side, log at **warn** with a fixed tag (`FREE_DAILY_LIMIT`, like `STALE_ACTION`),
  never at error. It is expected behaviour and must not page anyone or pollute the
  provider-error reports.

### 7. Configurable limits

New Firestore doc `config/limits`, sibling of `config/freeTierApiKeys`:

```
{ freeDailySpendUSD: 5, freeMonthlySpendUSD: 20, freeGamesPerDay: 5 }
```

- `getLimits()` in a new `app/api/limits-actions.ts` reads it with a ~60 s in-process
  cache and falls back to `FREE_TIER_LIMITS` when the doc or a field is missing. Changing
  the cap during a spike is a Firestore edit, not a deploy.
- `FREE_TIER_LIMITS` becomes the defaults: `GAMES_PER_CALENDAR_DAY: 5`,
  `DAILY_SPEND_USD: 5`, `MONTHLY_SPEND_USD: 20`. `CHAT_RESETS_PER_GAME_DAY` is deleted.
- The chat-reset limit removal deletes the checks in the two `delete-after*` routes, the
  remaining-resets counter in `GameChat.tsx:623`, and the stale "Switch to API tier" text.
- Landing page: `app/page.tsx` is a server component, so it renders the cap from
  `getLimits()`. The profile page does the same.

### 8. `requestStats` schema change

- Add `kind` (`'bot' | 'gm' | 'preview' | 'image' | 'tts' | 'stt'`). Keep `actor` on game
  LLM rows so `scripts/request-stats-report.ts` keeps meaning what it meant. Readers treat
  a missing `kind` as its `actor`; no migration.
- `buildRequestStatDoc` needs a sibling that takes `modelId` and `apiKeyName` directly for
  non-game spend. **A returned `null` must never silently skip the money**: log an error,
  the billing part still commits.
- Image rows carry `imageCount`.

### 9. Copy: landing page and profile

Free card (`app/page.tsx` TIERS, `ProfileTierCards.tsx`):

- $5 of AI a day on us, resets at midnight UTC, up to $20 a month (amounts from config)
- Up to 5 games a day
- A curated set of models with per-game bot caps, linking to `/models` (the page already
  has the Free/Paid filter and the band explainer)
- One portrait reroll per game
- Voices and mid-game illustrations included
- Never charged, no card

Paid card:

- Every model, including Fable 5.1 and GPT-6 Astra
- No daily or monthly cap, no game limit, no bot caps: play while the balance is positive
- Unlimited portrait rerolls
- Replay a night
- Prepaid balance, model base price + 15%

Profile "Your free allowance" block: replace the games-today stat with **"$3.20 of $5
today"** plus the reset time, add **"$11.40 of $20 this month"** (the monthly figure is
already computed on the page), keep the games counter as a secondary line, keep the model
count. The hero line "Start with five games a day" becomes the allowance wording.

A changelog entry (`app/news/changelog.tsx`) and a Discord post go out with the release,
since this loosens limits for every free user.

### 10. Reports

**Werewolf side.** New `scripts/stats-daily.ts` replacing the ad-hoc `tmp-` scripts: per
UTC day, `requestStats` cost split by `kind` and by `apiKeyName`, new users, new games,
distinct active users, and the count of users who hit the daily limit.

**Marlow side** (`~/projects/marlow/handlers/werewolf_stats.py`). Add:

1. `_user_spend_day()`: query `users` where `dailySpend.date == <the day>`. Total, median,
   top 5 spenders (masked), and how many users spent anything.
2. `limit_hits_day`: users with `dailySpend.limitHits > 0` and the sum of hits.
3. **A reconciliation invariant**: for a closed day, `Σ requestStats.costUSD` must equal
   `Σ users.dailySpend.totalUSD` within rounding. Print `BROKEN` on mismatch. This check
   would have caught the present bug on day one.

Digest shape stays one consolidated block.

### 11. Verification

1. **Ledger reconciliation.** After one day of real traffic, `Σ requestStats.costUSD` for
   the UTC day == `Σ users.dailySpend.totalUSD` == the `daily_burn_usd` delta.
2. **The provider check, the real acceptance test.** For a full day, the Gemini total in
   `requestStats` must match the AI Studio balance delta within rounding. Repeat for
   OpenAI and Anthropic.
3. **The cap actually fires, everywhere.** Drive one free account past the cap in a day
   with the cap temporarily set to $0.20 in `config/limits`, and confirm: the next bot
   turn in a running game stops with the money-worded banner and a working Retry, a new
   game is refused, a preview is refused, an avatar reroll is refused, TTS is refused,
   `limitHits` increments, and the next UTC day resets. Repeat once with the monthly cap
   set below the account's month-to-date spend. Then confirm a paid account is untouched.
4. **Library unit tests** for `periodKey`, both reducers (including the daily overwrite on
   a new date), and `evaluateBudget` at the boundary (`spent == limit` refuses).

## Out of scope

- Multi-account detection (problem 5). Needs signup friction or device/IP correlation;
  its own doc.
- Paid-tier pricing or markup changes.
- Making the image pipeline cheaper (images were 22% of all game spend, $12.61 of $58.00).
  Cost reduction, file separately.
- The phase-2 agent hook in the library, tracked here but shipped after the app change.

## Shipped vs. plan (2026-09-11)

- **Library**: `@hiper2d/ai-agents` 0.3.0 added `src/budget/` (period keys, `applySpend`,
  `ledgerSpend`, `evaluateBudget`, `firstRefusal`, `BudgetExceededError`, `SpendStore` +
  `InMemorySpendStore`, `BudgetController`); 0.3.1 added `setBeforeAskHook` on
  `AbstractAgent`. The "phase 2" hook shipped in phase 1 because every call site already
  set `agent.userId`, so it cost one line in the factory.
- **`dailySpend` shape** is the library ledger (`period` / `buckets`), not the
  `date` / `freeUSD` / `paidUSD` fields sketched above. Marlow reads the shipped shape.
- **No in-transaction re-check**; spend is always recorded (section 2).
- **Guard placement**: hook + five explicit sites (section 4) instead of a helper at ten
  call sites.
- **Error**: `FreeSpendLimitError` (code `FREE_SPEND_LIMIT`) with `isFreeSpendLimitError`
  and `freeSpendLimitWindow` in `app/api/errors.ts`; the guard logs `FREE_SPEND_LIMIT: …`
  at warn.
- **Config**: `config/limits` read by `getFreeTierLimits()` (`app/api/limits-actions.ts`),
  60 s cache, per-field fallback. `scripts/init-limits.ts` seeds the doc with the
  defaults; the app works without it.
- **`updateUserMonthlySpending`** stays for admin/backfill only and now also moves the
  daily ledger so both agree if it is ever used.
- **Verification** steps 1-3 are still owed after a day of production traffic; step 4
  (library unit tests) and the app suites are done.
