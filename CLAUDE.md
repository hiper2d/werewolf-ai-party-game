# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Werewolf AI Party Game where AI bots pretend to be humans and don't know about other AI players. Each bot has personal goals, secret roles, and alliances. The game supports multiple AI models from OpenAI, Anthropic, Google, DeepSeek, and Mistral.

## Development Commands

All commands should be run from the `werewolf-client/` directory:

```bash
# Development
npm run dev          # Start development server on localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run Jest tests

# Firebase (requires Firebase CLI)
firebase deploy --only firestore:indexes    # Deploy Firestore indexes
```

## Architecture

### AI Agent System — the `@hiper2d/ai-agents` library
The agent layer lives in the npm package [`@hiper2d/ai-agents`](https://github.com/hiper2d/ai-agents) (repo: `~/projects/ai-agents`), extracted from this app in Aug 2026. The split:
- **Library owns model facts**: per-provider agents (`ClaudeAgent`, `Gpt5Agent`, `GoogleAgent`, …), `AbstractAgent` (template method with logging, per-instance `maxOutputTokens` / `reasoningEffort` / `thinkingBudgetTokens`), `AgentFactory`, the model catalog (`SupportedAiModels`, `LLM_CONSTANTS` — constant name = version-free picker id in upper snake case), `MODEL_PRICING` + cost accounting, schema-validated asks via `askWithZodSchema()`, thinking extraction. Since 0.2.0 also the **voice agents**: `VoiceAgentFactory` → `speak()` / `transcribe()` for the `openai` (gpt-4o-mini-tts + Whisper) and `google` (Gemini TTS + Transcribe) providers, `VOICE_MODEL_CONSTANTS` / `VOICE_MODEL_PRICING`; agents report `costUSD`, the app's `tts-actions.ts` / `stt-actions.ts` only do auth, tier and billing. Since 0.5.0 also the **images subpath** (`@hiper2d/ai-agents/images`): the Gemini image call, the cast portrait sheet (grid layout, sheet prompt, divider-line cell detection, 3:4 card cutting) and the pure framing geometry; the library never imports sharp — the app passes its own instance in
- **App owns policy** (`app/ai/ai-models.ts` overlay): free-tier bands and per-game caps, `DEPRECATED_MODEL_MAP`/`resolveModelId`, `RANDOM`, which image model each pipeline uses, story-generation settings, the avatar SUBJECT (who is on a sheet, how each character is described: `app/utils/avatar-generation.ts`) plus all avatar storage, candidates, drafts, reframing and billing, the voice metadata lists (`app/ai/voice-config/`: which voices exist per provider, gender, descriptions for casting); `app/ai/agent-factory.ts` wraps the library factory and wires `setLlmLogger` to BetterStack
- **Model updates** (new model, price change, reasoning pins) go in the LIBRARY repo's `src/catalog.ts`, then release: bump version, `git tag vX.Y.Z && git push origin main vX.Y.Z` (publishes via GitHub Actions), then `npm i @hiper2d/ai-agents@X.Y.Z` here. Never edit model facts in this repo — they don't live here anymore

### Speaker routing (who talks next)
`app/api/bot-selection.ts` decides which bots reply after each message. With a Jev key configured (`TYPESAFE_API_KEY` in `config/freeTierApiKeys`; in `next dev` also `J_K`/`TYPESAFE_API_KEY` from `.env`) it runs the **Jev router** (`app/api/jev-router.ts` + `app/ai/jev-client.ts`; the question wording and score levels live in `app/ai/prompts/jev-router-prompts.ts`): one sub-second call to typesafe.ai's System One judge model returns an independent 0–3 reply `score` per bot (`reply_<name>`, four literal levels; the top level = "must reply now"), a `quiet_pick` choice over the quiet pool and an "is it dramatic" noul, and code composes the set (random 2–5 count, must-picks = top-level probability ≥ 0.6, fill by score, 1–2 slots from the quiet pool = the 3 least-active bots by `dayActivityCounter`, ordered by fewest messages then `quiet_pick` relevance, never the last author). Per-bot independent questions on purpose: a single `choice` over all bots is winner-take-all and starves the second and third speakers. Every call is recorded in full (state, questions, answers, decision, config) in the Firestore collection `jevRouterCalls` (`app/api/jev-records.ts`, 180-day `expireAt`); `scripts/jev-replay.ts --game <id> --last` re-runs the current selection logic on a recorded call. Better Stack (`activity = 'jev_router'`) and the dev console get only the decision, timing and cost — never the request or the raw answers (turned off 2026-09-19). Jev cannot generate text or count — keep those in code. Billed via `recordRouterSpend` (kind `router`). Without the key, the Game Master LLM router runs as before.

### Content screen (human input)
`app/api/jev-screen.ts` judges every piece of text a HUMAN types — a chat message (in `handleHumanPlayerMessage`, before it is saved) and a new game's name/theme/instructions (in `previewGame`, before any story token) — with one ~200 ms Jev call: a 0–3 risk `score` over four literal levels plus five yes/no flags (sexual, minors, hate, real_harm, jailbreak); wording in `app/ai/prompts/jev-screen-prompts.ts` (bump `JEV_SCREEN_PROMPT_VERSION` on any edit). The point is the platform keys: a provider that keeps receiving content it has labeled prohibited flags the account, and the per-game provider block list only stops the second hit. Verdicts: `ok`, `grey` (score ≥ 1.2, logged only), `would_block` (top-two-level probability ≥ 0.6, or minors/real_harm/hate ≥ 0.9). Mode is the `jevScreenMode` field of Firestore `config/limits`: `monitor` (default: record only, never rejects), `enforce` (would-block rejects — chat returns `GameActionResponse.rejected` and the composer keeps the draft with a notice; preview throws, the form shows the message), `off`. Bot output is never screened; a Jev error or timeout fails open. Every call is recorded in full in the Firestore collection `jevScreenCalls` (`app/api/jev-records.ts`, 180-day `expireAt`, flat rows meant for a later BigQuery export); Better Stack (`activity = 'jev_screen'`) carries only the verdict, never the screened text or answers; billed as SpendKind `screen`. `scripts/jev-screen-report.ts --days 7 [--all] [--replay]` prints the verdict distribution, latency, the grey/would-block rows and a join against games that later hit a provider refusal — read that before switching to `enforce`. Marlow's daily Werewolf stats report (`~/projects/marlow/handlers/werewolf_stats.py`, 05:05 UTC, Telegram digest) reads the same collection and carries the day's would-block rows and the refusal join.

### Game State Management
- **Game States**: WELCOME → DAY_DISCUSSION → VOTE → VOTE_RESULTS → NIGHT_BEGINS → GAME_OVER
- **State Queues**: `gameStateParamQueue` and `gameStateProcessQueue` manage state transitions
- **Message System**: All game interactions are messages with types (GM_COMMAND, BOT_ANSWER, etc.)

### Authentication & Data
- **NextAuth v5**: GitHub and Google OAuth providers
- **Firebase**: Firestore for data persistence, Firebase Auth integration
- **Tiers & Billing**: Two tiers — free (capped: $5/UTC day and $20/month of platform-key AI spend across ALL paths, plus 5 games/day; live values in Firestore doc `config/limits` read by `app/api/limits-actions.ts`) and paid (prepaid USD balance via Stripe, 15% markup, no caps). All AI calls use platform keys (Firestore doc `config/freeTierApiKeys`); users never supply their own API keys. Every spend goes through `recordSpend` (`app/api/cost-tracking.ts`), which charges, updates `users.spendings` (monthly) + `users.dailySpend` and writes a `requestStats` row in one transaction; the free-tier guard `assertFreeSpendWithinLimit` runs before every LLM ask via the agent-factory `setBeforeAskHook` and explicitly before images/voice. Design: `docs/plan-user-spend-tracking-and-daily-cap.md`

### Key Directories
- `app/ai/`: prompts, model policy overlay (`ai-models.ts`), factory wrapper — agent implementations are in `@hiper2d/ai-agents`
- `app/api/`: Server actions for game/user operations  
- `app/games/[id]/`: Game UI and components
- `firebase/`: Firebase configuration and rules
- `scripts/`: Utility scripts for message/game operations

### Message Flow
1. Game Master sends commands to bots
2. Bots respond via AI agents using conversation history
3. All messages stored in Firestore with recipient targeting
4. SSE (Server-Sent Events) for real-time updates

## Environment Setup

Required environment variables:
- `GITHUB_ID`, `GITHUB_SECRET` (GitHub OAuth)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google OAuth)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Firebase Admin SDK)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_*` (Stripe payments)
- AI provider keys live in the Firestore doc `config/freeTierApiKeys` (platform keys, all tiers)

## Production Debugging

To investigate user bug reports, stuck games, or production errors, use the `debugging` skill (`.claude/skills/debugging/SKILL.md`). It covers querying BetterStack app logs via the ClickHouse SQL API and reading production Firestore (find games by theme, dump game docs/messages/errorState) with the scripts in `werewolf-client/scripts/`. Credentials live in `werewolf-client/.env`.

## Testing

- Jest configuration in `jest.config.js`; `npm test` runs the app suites (mocked, free)
- Live API suites: `npm run test:live` here runs only the app-specific ones (`all-models` with real game prompts, TTS tiers). Provider-contract live tests (per-agent suites, all-providers sweep) moved to the `ai-agents` repo — run `npm run test:live` THERE after agent/SDK changes, before a library release
- Message utility tests ensure proper conversation formatting