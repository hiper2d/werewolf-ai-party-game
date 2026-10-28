import { getLlmRetryNotice } from '@/app/api/game-actions';
import type { LlmRetryNotice } from '@/app/api/game-models';

// A re-send can only begin after a first attempt failed, and the fastest failures seen in
// production took about 3s, so polling earlier is wasted invocations (production runs on a
// CPU-capped Vercel plan). After that, one light read every few seconds until the action
// returns — most turns never reach the first poll.
export const LLM_RETRY_POLL_DELAY_MS = 6_000;
export const LLM_RETRY_POLL_INTERVAL_MS = 4_000;

/**
 * Polls the game's re-send notice while a game action is in flight and reports each change
 * (null when the notice is gone). Returns the stop function, which also reports null so the
 * rail clears the moment the action is over.
 */
export function watchLlmRetryNotice(gameId: string, onChange: (notice: LlmRetryNotice | null) => void): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown: string | null = null;

    const poll = async () => {
        if (stopped) return;
        try {
            const notice = await getLlmRetryNotice(gameId);
            if (stopped) return;
            const key = notice ? `${notice.actor}:${notice.attempt}:${notice.startedAt}` : null;
            if (key !== shown) {
                shown = key;
                onChange(notice);
            }
        } catch {
            // A missed poll only delays the notice; the action's own error reaches the page anyway.
        }
        if (!stopped) timer = setTimeout(poll, LLM_RETRY_POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, LLM_RETRY_POLL_DELAY_MS);
    return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        if (shown !== null) onChange(null);
    };
}
