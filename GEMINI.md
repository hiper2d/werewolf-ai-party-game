# AI Werewolf Party Game - Project Context

## Project Overview

**AI Werewolf** is a web-based party game where human players interact with AI-driven bots. The bots play as characters with secret roles (Werewolf, Villager, Doctor, Detective), personal goals, and alliances. They do not know who the other bots are and must deduce roles through conversation and voting.

### Key Features
*   **AI Models:** Integration with OpenAI, Anthropic, Google (Gemini), DeepSeek, Mistral, Grok, and Moonshot AI via their respective SDKs.
*   **Game Logic:** Complete Werewolf game mechanics including day phases (discussion, voting) and night phases (werewolf kills, doctor saves, detective investigations).
*   **Platform:** Next.js 16 application using Firebase for real-time data and authentication.

## Tech Stack

*   **Frontend:** Next.js 16 (React 19), Tailwind CSS.
*   **Backend:** Firebase (Firestore, Authentication).
*   **Language:** TypeScript.
*   **AI Integration:** Direct vendor SDKs (no intermediate framework like LangChain).
*   **Testing:** Jest.

## Getting Started

### Prerequisites
*   Node.js and npm.
*   Firebase project (Auth & Firestore enabled).
*   `.env.local` configured with API keys (see `werewolf-client/README.md` or existing environment configs).

### Commands (Run from `werewolf-client/` directory)

*   **Install Dependencies:** `npm install`
*   **Development Server:** `npm run dev` (Runs on `http://localhost:3000`)
*   **Build:** `npm run build`
*   **Test:** `npm test`
*   **Lint:** `npm run lint`
*   **Deploy Firestore Indexes:** `firebase deploy --only firestore:indexes` (Requires Firebase CLI)

## Architecture & Logic

### Game Loop
The game follows a state machine pattern managed in Firestore:
1.  **WELCOME:** Game setup.
2.  **DAY_DISCUSSION:** Players and bots chat.
3.  **VOTE:** Players vote to eliminate a suspect.
4.  **VOTE_RESULTS:** Outcome of the vote is revealed.
5.  **NIGHT:** Special roles perform actions (Werewolf kills, Doctor saves, Detective investigates).
6.  **NIGHT_RESULTS:** Night outcomes are processed and revealed.
7.  **GAME_OVER:** Win conditions met.

### Key Logic Locations
*   **Game End Logic:** `werewolf-client/app/api/night-actions.ts` (specifically `startNewDay` checks for win conditions).
*   **Win Conditions:** `werewolf-client/app/utils/game-utils.ts` (`checkGameEndConditions`).
*   **State Transitions:** `werewolf-client/app/api/game-actions.ts`.
*   **AI Agents:** `werewolf-client/app/ai/` (Implementations for each provider, e.g., `anthropic-agent.ts`, `google-agent.ts`).

### Data Flow
1.  **User Action:** Triggers a Server Action (e.g., in `app/api/`).
2.  **State Update:** Action updates Firestore document `games/{gameId}`.
3.  **Real-time UI:** React components listen to Firestore updates.
4.  **AI Response:** AI agents process game state and append messages to `games/{gameId}/messages`.

## Directory Structure

*   `werewolf-client/`: Main application source.
    *   `app/`: Next.js App Router structure.
        *   `ai/`: AI Agent implementations.
        *   `api/`: Server Actions and backend logic.
        *   `games/`: Game UI pages and components.
        *   `utils/`: Shared helper functions.
    *   `firebase/`: Client/Server Firebase config.
    *   `scripts/`: Maintenance scripts (TS).
*   `docs/`: Documentation for specific AI providers.

## Reference Documentation

*   **`CLAUDE.md`**: Detailed developer context and architecture notes.
*   **`QUICK_REFERENCE.md`**: High-level guide to critical game logic files.
*   **`FILE_LOCATIONS.md`**: Exhaustive mapping of file paths to game functionality (highly recommended for deep dives).
*   **`END_GAME_FLOW_DIAGRAM.md`**: Visual representation of the game end flow.
