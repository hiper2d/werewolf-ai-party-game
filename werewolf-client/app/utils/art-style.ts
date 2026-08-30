/**
 * Optional free-text art direction the player types on the new-game page
 * ("art style"). It is passed verbatim to the image models — the avatar grid,
 * the welcome/night scene pair and mid-game illustrations — so every picture in
 * a game shares one look the player chose, instead of whatever style the model
 * invents from the theme alone.
 *
 * Never fed to the story/LLM prompts: it is drawing direction only.
 */
export const ART_STYLE_MAX_LENGTH = 300;

/**
 * Normalizes untrusted art-style text before it is persisted or pasted into an
 * image prompt: control characters and newline runs out (they let the prompt be
 * restructured), whitespace collapsed, length capped. Returns undefined when
 * nothing usable is left, so callers can omit the field entirely (Firestore
 * rejects undefined values).
 */
export function sanitizeArtStyle(raw: string | undefined | null): string | undefined {
    if (!raw) return undefined;
    const cleaned = raw
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, ART_STYLE_MAX_LENGTH)
        .trim();
    return cleaned || undefined;
}
