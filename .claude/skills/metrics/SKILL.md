---
name: metrics
description: Answer product and usage questions about the Werewolf game from production data — how many users and games, which languages, models, voices and modes players pick, whether they edit the generated cast, feature reach, retention, spend by day or model. Use when Alex asks "how many", "do people use X", "what do players choose", "is anyone playing in Japanese", or wants a usage read before a product decision. Not for bug hunting (that is the debugging skill).
---

# User metrics — what players do, read from production

Every number comes from Firestore (admin SDK, read-only scripts) or, for a few things, Better Stack. The data is already collected: the job is to know which collection answers the question, which script prints it, and which caveats bend the number.

## Rules

1. **Exclude Alex's own account** (`hiper2d@gmail.com`) from every user-facing count. Marlow's digest does; the repo scripts mostly do not, so say so when you quote one. Any other test account Alex names goes out too.
2. **Mind the retention windows.** `games` live 30 days, `featureEvents` / `requestStats` / `jevScreenCalls` / `jevRouterCalls` 180 days, `users` forever. Anything that says "all games" means the last month. The only long time series is Marlow's history file (below).
3. **A number without its window is wrong.** Always state the window and whether own games are in. UTC unless told otherwise; the Marlow digest uses a local calendar day.
4. Never print user emails into chat beyond what the question needs; never print keys or balances of people other than the one asked about.
5. Read before adding: if a question needs a new column, check `game_created` / `requestStats` first — most form choices are already recorded.

## Credentials and running

Scripts run from `werewolf-client/` with the env file loaded. `tsx` dies in the sandbox (`listen EPERM ... tsx-501/<pid>.pipe`), so run them with the sandbox off:

```bash
cd werewolf-client
npx tsx --env-file=.env scripts/<script>.ts <args>
```

Firestore credentials are `FIREBASE_*` in `werewolf-client/.env` (gitignored; `firebase/server.ts` reads them). Better Stack access is described in the debugging skill.

## Where each answer lives

| Question | Source | Script |
|---|---|---|
| Games and active users today / this week | `games` (`createdAt`, `ownerEmail`, `gameState`, `createdWithTier`, `errorState`) | `stats-today.ts [hoursBack]` |
| New vs returning users | `users.created_at` (epoch s, signup) joined with their games | `stats-new-users.ts` |
| One row per day: cost by kind and key, requests, active users, new users, new games | `requestStats` + `users` + `games` | `stats-daily.ts [--days 7]` |
| **What players choose on the new-game form**: language, voice provider, mode, long replies, tier, art style, player count, Game Master | `featureEvents` where `feature = game_created` (`detail.*`) | `feature-events-report.ts [--days 7]` |
| **Do players edit the generated cast** (names, stories, play style / appearance / voice, opening story) before Create | same row: `detail.editedNames`, `editedStories`, `editedDetails` (counts of bots), `editedScene` (bool); rows since 2026-10-29 | `feature-events-report.ts` — "edited on the preview" block |
| Feature reach: portrait reframe / reroll / variant pick, preview drafts, spoken lines (by source), dictation; per-user power use | `featureEvents` (all features) | `feature-events-report.ts [--all]` |
| Which models get played, cost per model, tokens, reasoning share | `games` bots' `playerAiType` + `tokenUsage`; `requestStats` per model | `stats-by-model.ts [filter]`, `request-stats-report.ts`, `reasoning-stats.ts`, `output-token-percentiles.ts` |
| Spend: who spends, all-time big spenders, cap hits | `users.spendings` (all time, monthly periods), `users.dailySpend`, `requestStats` | `stats-costs.ts`, `stats-big-spenders.ts [minUSD]`, `stats-daily.ts` |
| Voice: OpenAI vs Google cost per call and per game, games per provider | `requestStats` kind `tts` / `stt` | `stats-voice.ts [--days 60]` |
| One user: tier, balance, spend | `users/{email}` | `peek-user.ts <email>` |
| Content screen verdicts, grey rows, refusal join | `jevScreenCalls` | `jev-screen-report.ts [--days 7]` |
| Speaker routing decisions | `jevRouterCalls` | `jev-replay.ts --game <id> --last` |
| Multi-account clusters (same browser / same IP) | `devices`, `ips`, `users.linkedVia` | Marlow digest only (`_device_clusters`) |

### Facts on the `game_created` row

One row per created game, `detail` flat: `tier`, `players`, `voiceProvider`, `gameMode`, `longReplies`, `language` (ISO code, `en` default), `artStyle` (bool: one was set), `gameMaster` (model id), and since 2026-10-29 the preview-edit counts. The game doc holds the same choices for 30 days; the event row holds them for 180. Rows before 2026-10-28 have no `language` (the picker did not exist: read them as English).

### The game doc (`games/{id}`), for ad-hoc reads

`createdAt` (epoch ms), `ownerEmail`, `createdWithTier`, `gameState` (WELCOME … GAME_OVER), `currentDay`, `language`, `gameMode`, `longReplies`, `voiceProvider`, `gameMasterAiType`, `bots[]` (`name`, `aiType`, `role`, `isAlive`, `tokenUsage`), `humanPlayerRole`, `humanPlayerIsAlive`, `theme`, `story`, `totalGameCost`, `errorState`, `expireAt`. `currentDay` with `gameState` says how far a game got; `GAME_OVER` plus `humanPlayerIsAlive` says whether the human won through. The games collection has no full-text search; scripts fetch the N most recent by `createdAt` and filter locally. A new filter on two fields needs a composite index — prefer fetch-and-filter for a one-off.

### Better Stack lines worth counting

`FEATURE_USED: <feature>` (feature, gameId, the detail — never the user), `Game created: <id>` (theme, owner, language), `Preview token usage` (tier, language — previews that never became games). Filter `env = 'production'`. Query recipe in the debugging skill.

### Marlow's daily history — the long series

`~/projects/marlow/projects/werewolf-ops/state/stats_history.jsonl`: one JSON row per day since late Aug 2026 (`period_date`, `new_users_day`, `games_created_day`, `users_total_day_end`, `live_cost_usd_excl_own`, `own_games`, `user_spend_day_usd`, `limit_hits_day`, `screened_day`, `screen_would_block_day`, `provider_refusals_day`, …). Own games are already separated. Read it with a short `python3 -I` one-liner for anything older than 30 days — Firestore no longer has those games. The handler is `~/projects/marlow/handlers/werewolf_stats.py` (05:05 UTC, Telegram digest); its `EXCLUDED_OWNERS` is the exclusion list.

## Recipes

**"Is anyone playing in <language>?"** — `feature-events-report.ts --days 30`, read the `language` line in the form-choices block. For who and when: `--all` and grep the rows for `"language":"ja"`. Cross-check live games with a fetch-and-filter on `games.language` if the question is about games still open.

**"Do players keep the generated names / stories?"** — same report, the "edited on the preview before Create" block: games that touched each field, bots renamed / stories rewritten, games that kept the cast as generated. Only games created from 2026-10-29 carry the counts; say so.

**Retention (one-and-done share)** — no script yet. Pattern used for the 2026-10 read (107 users, 145 games, 84% one-and-done over 30 days): stream `games` in the window, group by `ownerEmail` (excluding own), count owners with 1 game vs ≥2; join `users.created_at` to split new signups from returning players. Games older than 30 days are gone, so a returning player with one game this month reads as one-and-done — say that.

**"How much did <model> cost us this month?"** — `stats-by-model.ts <substring>` for per-game attribution over stored games, `request-stats-report.ts --days 30` for the billed rows (the truth: every spend writes one row inside the billing transaction since 2026-09-11).

**Ad-hoc query** — copy `scripts/stats-today.ts`: import `db` from `../firebase/server`, stream or query, print. Keep it in `scripts/` only if it answers a question that will come back; one-offs go in the scratchpad.

## Adding a metric

- A **form choice** goes into the `game_created` detail in `createGame` (`app/api/game-actions.ts`) and into the field list in `feature-events-report.ts`. Flat values only (string / number / boolean).
- A **deliberate in-game action** is a new `FeatureName` in `app/api/feature-events.ts`, written with `recordFeatureEvent` after the action succeeded (best-effort, never blocks). Spend is not a feature event — `recordSpend` already writes `requestStats`.
- A **preview-page edit** is counted client-side in `app/games/newgame/preview-edits.ts` against the preview as it came back (`previewBaselineRef`); it never lands on the game doc.
- Something Alex wants every morning goes into Marlow's `werewolf_stats.py` report, not into a repo script.
