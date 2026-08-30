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
- **Library owns model facts**: per-provider agents (`ClaudeAgent`, `Gpt5Agent`, `GoogleAgent`, …), `AbstractAgent` (template method with logging, per-instance `maxOutputTokens` / `reasoningEffort` / `thinkingBudgetTokens`), `AgentFactory`, the model catalog (`SupportedAiModels`, `LLM_CONSTANTS` — constant name = version-free picker id in upper snake case), `MODEL_PRICING` + cost accounting, schema-validated asks via `askWithZodSchema()`, thinking extraction
- **App owns policy** (`app/ai/ai-models.ts` overlay): free-tier bands and per-game caps, `DEPRECATED_MODEL_MAP`/`resolveModelId`, `RANDOM`, audio/image models, story-generation settings; `app/ai/agent-factory.ts` wraps the library factory and wires `setLlmLogger` to BetterStack
- **Model updates** (new model, price change, reasoning pins) go in the LIBRARY repo's `src/catalog.ts`, then release: bump version, `git tag vX.Y.Z && git push origin main vX.Y.Z` (publishes via GitHub Actions), then `npm i @hiper2d/ai-agents@X.Y.Z` here. Never edit model facts in this repo — they don't live here anymore

### Game State Management
- **Game States**: WELCOME → DAY_DISCUSSION → VOTE → VOTE_RESULTS → NIGHT_BEGINS → GAME_OVER
- **State Queues**: `gameStateParamQueue` and `gameStateProcessQueue` manage state transitions
- **Message System**: All game interactions are messages with types (GM_COMMAND, BOT_ANSWER, etc.)

### Authentication & Data
- **NextAuth v5**: GitHub and Google OAuth providers
- **Firebase**: Firestore for data persistence, Firebase Auth integration
- **Tiers & Billing**: Two tiers — free (daily/monthly caps) and paid (prepaid USD balance via Stripe, 15% markup). All AI calls use platform keys (Firestore doc `config/freeTierApiKeys`); users never supply their own API keys

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