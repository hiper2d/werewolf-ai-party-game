import { GameMessage, MessageType } from "@/app/api/game-models";

/**
 * Message types whose `msg` is an envelope object (e.g. { reply, thinking, ...signature }
 * or { story, ... }) rather than a plain string. These must be stored in Firestore as
 * objects so history replay (convertToAIMessages) can extract the inner text and the
 * thinking/signature fields survive a round-trip. Every other type stores `msg` as a string.
 */
const OBJECT_MSG_TYPES: ReadonlySet<string> = new Set([
    MessageType.BOT_ANSWER,
    MessageType.BOT_WELCOME,
    MessageType.GAME_STORY,
    MessageType.VOTE_MESSAGE,
    MessageType.WEREWOLF_ACTION,
    MessageType.DOCTOR_ACTION,
    MessageType.MANIAC_ACTION,
    MessageType.NIGHT_SUMMARY,
]);

/**
 * Normalizes a GameMessage for Firestore persistence: keeps envelope-object message
 * types as objects, leaves everything else as a string, and guarantees `cost` is defined.
 * The stored shape is intentionally identical to the in-memory shape so old games replay
 * without any backfill (see plan-plaintext-llm-migration.md).
 */
export function serializeMessageForFirestore(gameMessage: GameMessage) {
    return {
        ...gameMessage,
        msg: OBJECT_MSG_TYPES.has(gameMessage.messageType)
            ? gameMessage.msg            // keep as object
            : gameMessage.msg as string, // it's a string for most other message types
        cost: gameMessage.cost || 0      // Ensure cost is never undefined
    };
}

/**
 * A player name as a message-id segment: lower-cased, letters and digits of any
 * script kept (a Russian game's "Иван" stays readable in the id), the rest dropped.
 * Uniqueness comes from the counter prefix, not from this segment.
 */
function sanitizeNameForId(name: string): string {
    return name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/**
 * The Firestore id of the `counter`-th message of a game: zero-padded counter (six digits,
 * so ids sort in order), then author and recipient.
 */
export function messageDocId(counter: number, authorName: string, recipientName: string): string {
    return `${counter.toString().padStart(6, '0')}-${sanitizeNameForId(authorName)}-to-${sanitizeNameForId(recipientName)}`;
}
