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

### AI Agent System
- **Abstract Base**: `AbstractAgent` class provides template method pattern with logging
- **Agent Factory**: `AgentFactory` creates agents based on AI model type and API keys
- **Supported Models**: Each vendor has its own agent implementation (OpenAiAgent, ClaudeAgent, GoogleAgent, etc.)
- **Structured Responses**: Uses JSON schemas for structured AI responses via `askWithSchema()`

### Game State Management
- **Game States**: WELCOME → DAY_DISCUSSION → VOTE → VOTE_RESULTS → NIGHT_BEGINS → GAME_OVER
- **State Queues**: `gameStateParamQueue` and `gameStateProcessQueue` manage state transitions
- **Message System**: All game interactions are messages with types (GM_COMMAND, BOT_ANSWER, etc.)

### Authentication & Data
- **NextAuth v5**: GitHub and Google OAuth providers
- **Firebase**: Firestore for data persistence, Firebase Auth integration
- **User API Keys**: Users store their own AI provider API keys

### Key Directories
- `app/ai/`: AI agent implementations and prompts
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
- Users provide their own AI API keys via the profile page

## Testing

- Jest configuration in `jest.config.js`
- AI agent tests verify response parsing and error handling
- Message utility tests ensure proper conversation formatting