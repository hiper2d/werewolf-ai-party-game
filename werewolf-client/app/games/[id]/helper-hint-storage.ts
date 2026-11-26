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

/** "Show hints as I play" at the end of the tour: every hint of this game is live again. */
export function clearRetiredHints(gameId: string): void {
    try {
        localStorage.removeItem(dismissedKey(gameId));
        localStorage.removeItem(`helperComposerOpens:${gameId}`);
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, {detail: gameId}));
    } catch { /* private mode */ }
}

// Per browser, not per game: the player turned the hints off, and has been shown where
// the button that replays them is.
const OFF_KEY = 'helperHintsOff';
const OFF_TOLD_KEY = 'helperHintsOffTold';

export function readHintsOff(): {off: boolean; told: boolean} {
    try {
        return {off: localStorage.getItem(OFF_KEY) === '1', told: localStorage.getItem(OFF_TOLD_KEY) === '1'};
    } catch {
        return {off: false, told: false};
    }
}

export function writeHintsOff(off: boolean): void {
    try {
        if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY);
    } catch { /* private mode */ }
}

export function writeHintsOffTold(): void {
    try { localStorage.setItem(OFF_TOLD_KEY, '1'); } catch { /* private mode */ }
}
