/**
 * Player names act as identifiers across the entire game — vote targets, GM bot
 * selection, message author/recipient routing — all of which compare names by
 * exact string match. A stray space or a differently-encoded character therefore
 * doesn't just look wrong, it silently breaks every later match and can brick a game.
 *
 * The canonical rule: a valid name is ONE word of letters and digits in any script
 * (Unicode \p{L} / \p{N}, plus the combining marks \p{M} some scripts need), stored
 * in NFC so "é" typed as e + ◌́ and "é" typed as one character are the same name.
 * Spaces, punctuation, apostrophes and hyphens are never part of a name. Until
 * 2026-10-28 the rule was ASCII-only; a game played in Russian or Japanese needs
 * names in its own script, and both router judges accept them as question keys.
 * This module is the single source of truth for that rule, shared by the new-game
 * UI and the server-side create path.
 */

/** Regex a fully-valid name must satisfy. */
export const VALID_NAME_PATTERN = /^[\p{L}\p{N}\p{M}]+$/u;

/**
 * Coerce an arbitrary string into a valid name: compose it (NFC) and strip
 * everything that isn't a letter, digit or combining mark. May return an empty
 * string if nothing valid remains — callers that need a guaranteed-non-empty id
 * must check.
 */
export function sanitizePlayerName(raw: string): string {
    return (raw ?? '')
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/**
 * Identity key for uniqueness checks: the sanitized name, case-folded. Names are
 * matched exactly elsewhere, but two names differing only in case still collide
 * in the eyes of the players (and of the vote target list, which the 2026-10-14
 * "zach town" game collapsed to a single entry with eleven bots named the same).
 */
export function playerNameKey(raw: string): string {
    return sanitizePlayerName(raw).toLowerCase();
}

/**
 * Bots whose name collides with the human's or with another bot's, keyed by bot
 * index, each with a user-facing message. Empty (unsanitizable) names are skipped
 * here — validatePlayerName / the create path reject those on their own.
 */
export function duplicateNameErrors(humanName: string, botNames: string[]): Record<number, string> {
    const errors: Record<number, string> = {};
    const humanKey = playerNameKey(humanName);
    const seen = new Map<string, number>();
    botNames.forEach((botName, index) => {
        const key = playerNameKey(botName);
        if (!key) return;
        if (key === humanKey) {
            errors[index] = `"${botName.trim()}" is your name — every player needs a different one`;
            return;
        }
        const first = seen.get(key);
        if (first !== undefined) {
            errors[index] = `"${botName.trim()}" is already taken by another player`;
            if (errors[first] === undefined) {
                errors[first] = `"${botNames[first].trim()}" is used by more than one player`;
            }
            return;
        }
        seen.set(key, index);
    });
    return errors;
}

/**
 * Validate a name. Returns a user-facing error message, or null when valid.
 */
export function validatePlayerName(name: string): string | null {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
        return 'Name cannot be empty';
    }
    if (!VALID_NAME_PATTERN.test(trimmed.normalize('NFC'))) {
        return 'Name can only contain letters and numbers (no spaces)';
    }
    return null;
}
