export const WHATS_NEW_STORAGE_KEY = 'newsLastSeenId';

/**
 * A null storedId means a first visit: the caller seeds storage silently
 * instead of showing the popup, so everything before that visit reads as seen.
 */
export function shouldShowWhatsNew(storedId: string | null, latestId: string | undefined): boolean {
    if (!latestId) return false;
    if (storedId === null) return false;
    return storedId !== latestId;
}

export function readLastSeenNewsId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function writeLastSeenNewsId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, id);
    } catch {
        // Storage unavailable (private mode, blocked) — the popup just won't track.
    }
}
