---
name: debugging
description: Investigate production issues in the Werewolf game — query BetterStack app logs (ClickHouse SQL API) and Firestore (games, messages, errorState, users) directly. Use when debugging a user bug report, a stuck/errored game, missing voices, provider failures, or anything that needs production logs or game data.
---

# Production Debugging — BetterStack logs + Firestore

Two read paths into production: **BetterStack** (app-level logs: unhandled errors, provider failures, server errors) and **Firestore** (game state: docs, messages, errorState, users). Use both — logs tell you *what threw*, Firestore tells you *what the player saw*.

## Credentials

Everything lives in `werewolf-client/.env` (gitignored — never commit, never print values to chat):

- `BETTERSTACK_CH_HOST`, `BETTERSTACK_CH_USER`, `BETTERSTACK_CH_PASS` — read-only ClickHouse query credential for the BetterStack SQL API (Telemetry → Integrations → SQL API). This is NOT the app's `NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN` (that one is ingest-only).
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — Firebase admin service account, used by `firebase/server.ts`.

⚠️ The `.env` is NOT shell-sourceable (unquoted multiline values break `source`). Extract single vars with grep:

```bash
BS_HOST=$(grep '^BETTERSTACK_CH_HOST=' .env | cut -d= -f2-)
```

## BetterStack logs (ClickHouse SQL over HTTP)

The app ships structured logs via `@logtail/node` (`app/utils/logger.ts`). Query them back with plain SQL POSTed over HTTP:

```bash
cd werewolf-client
BS_HOST=$(grep '^BETTERSTACK_CH_HOST=' .env | cut -d= -f2-)
BS_USER=$(grep '^BETTERSTACK_CH_USER=' .env | cut -d= -f2-)
BS_PASS=$(grep '^BETTERSTACK_CH_PASS=' .env | cut -d= -f2-)

curl -s -u "$BS_USER:$BS_PASS" "$BS_HOST?output_format_pretty_row_numbers=0" \
  -H "Content-type: plain/text" \
  -d "<SQL> FORMAT JSONEachRow"
```

### Storage model — query the S3 table

BetterStack is tiered ClickHouse: a hot table `remote(t507167_ai_werewolf_2_logs)` plus an S3 archive `s3Cluster(primary, t507167_ai_werewolf_2_s3)`. For this source the S3 flush is aggressive and holds effectively everything including near-real-time rows, so **query the S3 table**. (Only the freshest ~2 minutes may still be unflushed in hot.)

### Schema

No flat columns besides `dt` — each row's `raw` is the full JSON log line. Extract fields with `JSONExtractString`. Known structured fields the app logs: `level`, `message`, `gameId`, `botName`, `model`, `gameState`, `error`, `details` (stack trace), `recoverable`, `function`. `dt` is UTC.

### Recipes

Recent errors/warnings:

```sql
SELECT dt, JSONExtractString(raw,'level') AS lvl,
       substring(JSONExtractString(raw,'message'),1,300) AS msg
FROM s3Cluster(primary, t507167_ai_werewolf_2_s3)
WHERE dt > now() - INTERVAL 48 HOUR
  AND JSONExtractString(raw,'level') IN ('error','warn')
ORDER BY dt DESC LIMIT 50 FORMAT JSONEachRow
```

Everything about one game (full raw lines — `message` is often truncated/useless, `error`/`details` carry the substance):

```sql
SELECT raw FROM s3Cluster(primary, t507167_ai_werewolf_2_s3)
WHERE dt > now() - INTERVAL 7 DAY
  AND JSONExtractString(raw,'gameId') = '<gameId>'
ORDER BY dt DESC LIMIT 200 FORMAT JSONEachRow
```

Search log text:

```sql
... WHERE positionCaseInsensitive(raw, 'deepseek') > 0 ...
```

## Firestore (admin SDK via tsx scripts)

Run scripts from `werewolf-client/` with the env file loaded:

```bash
cd werewolf-client
npx tsx --env-file=.env scripts/<script>.ts <args>
```

Available debugging scripts (`scripts/`):

- `find-games.ts <searchText> [limit]` — find recent games by theme/story/description text (Firestore has no full-text search; this fetches recent games ordered by `createdAt` and filters locally). Prints id, state, owner, errorState.
- `get-game.ts <gameId>` — full game doc: `gameState`, `currentDay`, `errorState`, `gameStateProcessQueue`, bots (alive/dead, models, voices), `voiceProvider`, `createdWithTier`, voting history, night narratives.
- `get-messages.ts <gameId>` — dumps the full message log to `logs/game-messages-<id>-<ts>.json` (chat, GM commands, bot answers, votes — the player's-eye view).
- `stats-today.ts [hoursBack=24]` — daily activity snapshot over a UTC window: games created, distinct owners (`ownerEmail`), count with `errorState`, and breakdowns by `gameState` and `createdWithTier`, then a per-game line (created-at, state, tier, err flag, id). Scans the 500 most recent games by `createdAt`, so widen `hoursBack` only within that window. Use for "how many games/users today".
- `stats-new-users.ts` — for each owner active in the last 24h: user doc tier, first stored game, total stored games, new-vs-returning flag. Cross-check the user doc's `created_at` (epoch seconds) for true signup time — games TTL-expire (~30 days), so first-stored-game alone can misread an old returning user as new.
- Also: `delete-message.ts`, `delete-messages-after.ts`, `update-message.ts`, `fix-stuck-welcome.ts`, `view-free-tier-keys.ts` (see each script's header).

New one-off queries: copy the pattern from `scripts/get-game.ts` — import `db` from `../firebase/server`, write a small script, run with `npx tsx --env-file=.env`.

### Key collections

- `games/{id}` — game doc. `errorState` (null when healthy) is set by `setGameErrorState` on system errors: `{recoverable, context: {gameId, timestamp, function}, details}`. Games TTL-expire via `expireAt` (~30 days).
- `games/{id}/messages` — ordered message log (`timestamp`, `authorName`, `recipientName`, `messageType`, `msg`, `day`).
- `users/{email}` — user record incl. personal `apiKeys` and tier.
- `free-tier-keys` — platform API keys used for free-tier users (tier-aware lookup is `getApiKeysForUser` in `app/utils/tier-utils.ts`; plain `getUserApiKeys` reads only personal keys).

## Investigating a user bug report — workflow

1. **Find the game**: `find-games.ts` with a distinctive word from the theme/story the user described. If multiple, match on `createdAt` vs. when they played.
2. **Read the game doc**: `get-game.ts` — check `gameState` (is it actually over or just idle?), `errorState`, `createdWithTier`, `gameStateProcessQueue` (empty queue in DAY_DISCUSSION = waiting for human, not broken).
3. **Read the messages**: `get-messages.ts` — the tail shows the last thing the player saw and whether selected bots all answered.
4. **Cross-check BetterStack** by `gameId` for the same time window — provider failures and unhandled errors never reach the game doc.
5. Remember timezones: Firestore `timestamp` is epoch ms UTC, BetterStack `dt` is UTC.

### Triage heuristics (learned from real reports)

- "Game ended abruptly" usually doesn't mean ended: no in-game X ends a game. The X-shaped things are the mobile-drawer close, the red cancel-bot-responses button (appears after 10s of processing — clicking it silences bots and *looks* like the game died), modal closes, and the browser tab itself. If the game doc is alive, the player can simply re-open it from /games.
- "Voices don't load" on a free-tier game: check whether the TTS path resolves keys tier-aware. Free-tier users have no personal OpenAI key; any code path using `getUserApiKeys` instead of `getApiKeysForUser` throws "OpenAI API key not found".
- Recoverable errors (`recoverable: true`) show a dismissable banner with a retry button; the game often self-heals — a cleared `errorState` with later messages means the player got past it.
