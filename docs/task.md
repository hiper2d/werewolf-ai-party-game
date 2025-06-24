The problem is that next.js has some refresh loop, and we have to persist the error state. Let's create a field in the game object with the error message. We should intercept the backend calls and catch all errors. In case of an error, we should update the game object and then return the execution to the frontend. The frontend should display the error message in the error banner and don't send any requests to the backend. It should not process the current game state. The refresh button should reset the error state which should trigger the normal game state processing on UI.


Here is Claude's plan:                                                                                │
│ ╭───────────────────────────────────────────────────────────────────────────────────────────────────╮ │
│ │ Plan: Implement Persistent Error State with Server Action Wrapper                                 │ │
│ │                                                                                                   │ │
│ │ Problem Analysis                                                                                  │ │
│ │                                                                                                   │ │
│ │ Next.js refresh loops causing infinite backend requests due to local component error state        │ │
│ │ getting reset on component re-mounts (HMR, React strict mode). Need persistent error state in     │ │
│ │ database with global error interception.                                                          │ │
│ │                                                                                                   │ │
│ │ Solution Overview                                                                                 │ │
│ │                                                                                                   │ │
│ │ Use a custom server action wrapper (Option 2) to globally intercept all backend errors and        │ │
│ │ automatically update the game object with persistent error state. Frontend will check this        │ │
│ │ persistent state to block requests and display errors.                                            │ │
│ │                                                                                                   │ │
│ │ Implementation Steps                                                                              │ │
│ │                                                                                                   │ │
│ │ 1. Update Game Model (game-models.ts)                                                             │ │
│ │                                                                                                   │ │
│ │ - Add errorState?: SystemErrorMessage | null field to Game interface                              │ │
│ │                                                                                                   │ │
│ │ 2. Update Database Layer (game-actions.ts)                                                        │ │
│ │                                                                                                   │ │
│ │ - Add setGameErrorState(gameId: string, errorState: SystemErrorMessage): Promise<Game>            │ │
│ │ - Add clearGameErrorState(gameId: string): Promise<Game>                                          │ │
│ │ - Update gameFromFirestore() to include errorState field                                          │ │
│ │                                                                                                   │ │
│ │ 3. Create Server Action Wrapper (utils/server-action-wrapper.ts)                                  │ │
│ │                                                                                                   │ │
│ │ export function withErrorHandling<T extends any[], R>(                                            │ │
│ │   fn: (...args: T) => Promise<R>,                                                                 │ │
│ │   gameIdExtractor: (...args: T) => string                                                         │ │
│ │ ) {                                                                                               │ │
│ │   return async (...args: T): Promise<R> => {                                                      │ │
│ │     try {                                                                                         │ │
│ │       return await fn(...args);                                                                   │ │
│ │     } catch (error) {                                                                             │ │
│ │       const gameId = gameIdExtractor(...args);                                                    │ │
│ │       const systemError: SystemErrorMessage = {                                                   │ │
│ │         error: error instanceof BotResponseError ? error.message : 'System error occurred',       │ │
│ │         details: error instanceof BotResponseError ? error.details : (error instanceof Error ?    │ │
│ │ error.message : String(error)),                                                                   │ │
│ │         context: error instanceof BotResponseError ? error.context : { function: fn.name },       │ │
│ │         recoverable: error instanceof BotResponseError ? error.recoverable : true,                │ │
│ │         timestamp: Date.now()                                                                     │ │
│ │       };                                                                                          │ │
│ │                                                                                                   │ │
│ │       return await setGameErrorState(gameId, systemError) as R;                                   │ │
│ │     }                                                                                             │ │
│ │   };                                                                                              │ │
│ │ }                                                                                                 │ │
│ │                                                                                                   │ │
│ │ 4. Wrap All Server Actions                                                                        │ │
│ │                                                                                                   │ │
│ │ bot-actions.ts:                                                                                   │ │
│ │ - Rename existing functions to add Impl suffix (e.g., talkToAll → talkToAllImpl)                  │ │
│ │ - Export wrapped versions: export const talkToAll = withErrorHandling(talkToAllImpl, (gameId) =>  │ │
│ │ gameId)                                                                                           │ │
│ │ - Functions to wrap: welcome, talkToAll, vote, keepBotsGoing, humanPlayerVote                     │ │
│ │                                                                                                   │ │
│ │ night-actions.ts:                                                                                 │ │
│ │ - Wrap: performNightAction, replayNight, beginNight                                               │ │
│ │                                                                                                   │ │
│ │ game-actions.ts:                                                                                  │ │
│ │ - Wrap server actions that modify games: updateBotModel, updateGameMasterModel                    │ │
│ │                                                                                                   │ │
│ │ 5. Frontend Updates                                                                               │ │
│ │                                                                                                   │ │
│ │ GamePage.tsx:                                                                                     │ │
│ │ - Remove all local error state (hasErrorRef, errorDetails, setErrorDetails)                       │ │
│ │ - Add error state checks to all useEffect hooks: if (game.errorState) return;                     │ │
│ │ - Remove try/catch blocks from button handlers (backend handles errors now)                       │ │
│ │ - Update useEffect dependencies to include game.errorState                                        │ │
│ │                                                                                                   │ │
│ │ GameChat.tsx:                                                                                     │ │
│ │ - Remove local error state management (error, showErrorBanner, etc.)                              │ │
│ │ - Display error banner from game.errorState: {game.errorState && <ErrorBanner                     │ │
│ │ error={game.errorState} ... />}                                                                   │ │
│ │ - Update auto-processing useEffect to check !game.errorState                                      │ │
│ │ - Implement handleDismissError to call clearGameErrorState(gameId)                                │ │
│ │ - Remove try/catch from API calls (backend handles errors)                                        │ │
│ │ - Remove externalError and hasError props (no longer needed)                                      │ │
│ │                                                                                                   │ │
│ │ 6. Error Flow                                                                                     │ │
│ │                                                                                                   │ │
│ │ 1. Error occurs in any server action                                                              │ │
│ │ 2. Wrapper catches error and calls setGameErrorState()                                            │ │
│ │ 3. Game object updated in database with error state                                               │ │
│ │ 4. Updated game returned to frontend with error state                                             │ │
│ │ 5. Frontend displays error banner from game.errorState                                            │ │
│ │ 6. All processing blocked while error state exists                                                │ │
│ │ 7. User clicks dismiss → calls clearGameErrorState()                                              │ │
│ │ 8. Error cleared → normal processing resumes automatically                                        │ │
│ │                                                                                                   │ │
│ │ Key Benefits                                                                                      │ │
│ │                                                                                                   │ │
│ │ ✅ Single point of error handling - All server actions automatically wrapped                       │ │
│ │ ✅ Persistent across refreshes - Error state survives HMR and re-mounts                            │ │
│ │ ✅ Blocks infinite loops - Frontend checks persistent error state                                  │ │
│ │ ✅ Type safe - Wrapper preserves function signatures and return types                              │ │
│ │ ✅ Incremental adoption - Can wrap functions one by one                                            │ │
│ │ ✅ Clean recovery - Single dismiss action clears error and resumes flow                            │ │
│ │ ✅ Better error context - Captures function name and parameters                                    │ │
│ │                                                                                                   │ │
│ │ Files to Modify                                                                                   │ │
│ │                                                                                                   │ │
│ │ 1. app/api/game-models.ts - Add errorState field                                                  │ │
│ │ 2. app/api/game-actions.ts - Add error state functions, update gameFromFirestore                  │ │
│ │ 3. app/utils/server-action-wrapper.ts - New file with wrapper function                            │ │
│ │ 4. app/api/bot-actions.ts - Wrap all server actions                                               │ │
│ │ 5. app/api/night-actions.ts - Wrap all server actions                                             │ │
│ │ 6. app/games/[id]/GamePage.tsx - Remove local error state, add error checks                       │ │
│ │ 7. app/games/[id]/components/GameChat.tsx - Use persistent error state, remove local state  