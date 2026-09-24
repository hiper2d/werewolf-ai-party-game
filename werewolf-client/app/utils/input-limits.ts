/**
 * Caps on every piece of free text a player can put into a game, plus the
 * ceiling on a single dictation.
 *
 * Two independent reasons they exist:
 *  - Cost. Nearly all of this text ends up inside an LLM or image prompt, and
 *    the persistent fields (theme, GM instructions, bot stories, the opening
 *    story) are replayed into EVERY bot's context on EVERY turn — a pasted
 *    novel is billed dozens of times over, on platform keys.
 *  - Integrity. Names are identifiers compared by exact match, and the game
 *    title becomes part of the Firestore document id, which has a hard
 *    1500-byte ceiling.
 *
 * Inputs carry these as `maxLength` so the limit is visible while typing; the
 * server clamps again on the way in, because the client is untrusted. Tune the
 * numbers here — nothing else should hard-code a length.
 */
export const INPUT_LIMITS = {
    /** Human and bot names. Identifiers, ASCII alphanumerics only. */
    playerName: 24,
    /** Game title. Prefixes the Firestore game id. */
    gameTitle: 80,
    /** "Instructions for the Game Master" — steers story generation. */
    gmInstructions: 1500,
    /** Voice direction ("sly and playful, a smile in the voice"). Pasted into the TTS call. */
    voiceStyle: 300,
    /** A character's backstory. Sits in that bot's system prompt for the whole game. */
    botStory: 1500,
    /** A character's appearance. Pasted into the portrait image prompt. */
    visualDescription: 600,
    /** The opening story, editable on the preview page before the game starts. */
    openingStory: 6000,
    /** One chat message to the table. Read by every bot that replies. */
    chatMessage: 1500,
    /** Justification attached to the player's vote. */
    voteReason: 1000,
    /** Optional narrative hint on a night action, woven in by the GM. */
    nightHint: 600,
} as const;

/**
 * Longest single dictation, enforced by auto-stopping the recorder. Roughly
 * matches what fits in `chatMessage` at conversational speed (~150 words), so
 * the cap that bites is the one the player can see coming.
 */
export const MAX_STT_RECORDING_MS = 60_000;

/**
 * Server-side ceiling on an uploaded clip. The recorder stops itself well
 * before this; the byte cap is what stops a hand-built request from buying a
 * long transcription. WebM/Opus runs ~16 KB/s, so 60s is ~1 MB — 5 MB leaves
 * room for browsers that pick a fatter codec.
 */
export const MAX_STT_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Trim and cap untrusted text. Newlines survive (story fields are multi-line);
 * callers that need stricter normalization have their own sanitizer.
 */
export function clampUserText(raw: string | undefined | null, max: number): string {
    return (raw ?? '').trim().slice(0, max);
}
