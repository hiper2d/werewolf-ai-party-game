# Game Management Scripts

This directory contains utility scripts for working with game data. These scripts provide a command-line interface to the game management functions.

## Available Scripts

### 1. Get Game Messages
Lists all messages for a specific game, sorted by timestamp, and saves them to a JSON file in the logs directory.

```bash
npx tsx scripts/get-messages.ts <gameId>
```

Example:
```bash
npx tsx scripts/get-messages.ts umYTgtLzM8iqbwSMOpwP
```

This will create a file in the `werewolf-client/logs` directory with a name format:
```
game-messages-<gameId>-<timestamp>.json
```

The file contains a JSON array of all messages in the game, including:
- Message IDs
- Recipients and authors
- Message content
- Message types
- Day numbers
- Timestamps

### 2. Copy Game
Creates a complete copy of a game, including all its messages. Contains standalone Firestore operations.

```bash
npx tsx scripts/copy-game.ts <sourceGameId>
```

Example:
```bash
npx tsx scripts/copy-game.ts 5bHVwJCnRyJef2pQW5rk
```

Output:
```
Game copied successfully. New game ID: nvlnmQuYC3SwbYexMqcl
```

### 3. Update Message
Updates a specific message in a game. Uses addMessageToChatAndSaveToDb from game-actions.ts.

```bash
npx tsx scripts/update-message.ts <gameId> <messageId> '<messageJson>'
```

Example:
```bash
# Update a message to change from story to reply type
npx tsx scripts/update-message.ts nvlnmQuYC3SwbYexMqcl kXTKcNkUekygFLk3odeB '{"reply": "This is a new reply message"}'

# Update a story message
npx tsx scripts/update-message.ts nvlnmQuYC3SwbYexMqcl abc123 '{"story": "A new chapter begins..."}'
```

Output:
```
Message updated successfully
```

### 4. Delete Message
Deletes a specific message from a game.

```bash
npx tsx scripts/delete-message.ts <gameId> <messageId>
```

Example:
```bash
npx tsx scripts/delete-message.ts nvlnmQuYC3SwbYexMqcl kXTKcNkUekygFLk3odeB
```

Output:
```
Message with ID kXTKcNkUekygFLk3odeB deleted successfully from game nvlnmQuYC3SwbYexMqcl
Message deletion completed
```

### 5. Delete Messages After
Deletes all messages that come after a specified message ID in a game. This is useful for rolling back a game to a specific point.

```bash
npx tsx scripts/delete-messages-after.ts <gameId> <messageId>
```

Example:
```bash
npx tsx scripts/delete-messages-after.ts nvlnmQuYC3SwbYexMqcl kXTKcNkUekygFLk3odeB
```

Output:
```
Successfully deleted 5 messages after message kXTKcNkUekygFLk3odeB
Message deletion completed
```

## Message Structure

Messages can have different structures based on their type:

1. Story Messages:
```json
{
    "story": "Game story content..."
}
```

2. Reply Messages:
```json
{
    "reply": "Bot or player reply..."
}
```

3. Plain Text Messages:
```typescript
"Direct message text"
```

## Implementation Details

The scripts use a combination of:
- Functions from `app/api/game-actions.ts` for message operations (get-messages.ts, update-message.ts)
- Direct Firestore operations for specialized tasks (copy-game.ts)

These scripts provide a convenient command-line interface for maintenance and debugging purposes.