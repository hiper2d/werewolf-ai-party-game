/**
 * Which helper hints (helper-hints.ts) a player has retired, per game, in localStorage.
 * A hint is retired by its "Got it" button, or by the player DOING the thing it explains
 * before it ever shows (`retireHelperHint`, called from the button's own handler): a
 * player who has pressed Go on needs no hint about Go on.
 *
 * Every access is wrapped: with storage unavailable the hints just show.
 */

const dismissedKey = (gameId: string) => `helperHints:${gameId}`;
const CHANGED_EVENT = 'helper-hints-changed';

export function readRetiredHints(gameId: string): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(dismissedKey(gameId)) ?? '[]');
        return Array.isArray(raw) ? raw.filter(item => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export function retireHelperHint(gameId: string, hintId: string): void {
    try {
        const retired = readRetiredHints(gameId);
        if (retired.includes(hintId)) return;
        localStorage.setItem(dismissedKey(gameId), JSON.stringify([...retired, hintId]));
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, {detail: gameId}));
    } catch { /* private mode */ }
}

/** Calls back when a hint of this game is retired from outside the hint component. */
export function onRetiredHintsChange(gameId: string, callback: () => void): () => void {
    const listener = (event: Event) => {
        if ((event as CustomEvent).detail === gameId) callback();
    };
    window.addEventListener(CHANGED_EVENT, listener);
    return () => window.removeEventListener(CHANGED_EVENT, listener);
}
