import { logger } from "@/app/utils/logger";

/**
 * Tolerant resolution of a player name a model wrote into a vote or night-action answer.
 *
 * Every provider now returns well-formed JSON, but the name INSIDE the string can still come out
 * damaged: Muse Spark 1.3 answered a doctor prompt with "Twilightaya", "Sonatabitcoinbips.xyz…"
 * and "Twilight noexcept——correction Twilight strictly…" on consecutive retries (2026-10-18/19,
 * 4 of 123 calls, all one bot). Each one STARTS with the intended name and trails into garbage.
 * Rejecting those cost the player five Retry clicks for one night.
 *
 * `resolveTargetName` takes the exact name when there is one, otherwise the longest candidate
 * the answer starts with. Longest wins so "Anna…" resolves to Anna, not Ann, when both play.
 * Nothing fuzzier than a prefix: a name that merely contains a candidate ("my vote is Twilight")
 * stays unresolved and goes through the existing rejection + retry-hint path, which tells the
 * model what it did wrong. Comparison is case-sensitive on purpose — names are copied from a
 * list the model was shown, and the prompts already demand a verbatim copy.
 */
export function resolveTargetName(raw: string | null | undefined, candidates: readonly string[]): string | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const answer = raw.trim();
    if (!answer) {
        return null;
    }
    if (candidates.includes(answer)) {
        return answer;
    }
    let best: string | null = null;
    for (const name of candidates) {
        if (name && answer.startsWith(name) && (best === null || name.length > best.length)) {
            best = name;
        }
    }
    return best;
}

export interface TargetResolutionContext {
    gameId: string;
    botName: string;
    /** The model id the bot runs on, for tracking which providers damage names. */
    model?: string;
    /** What the name was for: 'vote', 'doctor', 'detective', 'maniac', 'werewolf'. */
    action: string;
}

/**
 * The call-site form: returns the resolved name, or the raw answer unchanged when nothing
 * resolves, so the caller's own validation still rejects it with the usual explanation. A
 * prefix repair is logged once at `warn` under a stable code so the digest keeps counting how
 * often each model needs it — the point is to keep that visible, not to hide it.
 */
export function normalizeTargetName(raw: string, candidates: readonly string[], ctx: TargetResolutionContext): string {
    const resolved = resolveTargetName(raw, candidates);
    if (resolved === null || resolved === raw) {
        return raw;
    }
    logger.warn(`TARGET_RESOLVED_BY_PREFIX: ${ctx.action} answer "${raw}" read as "${resolved}"`, {
        gameId: ctx.gameId,
        botName: ctx.botName,
        model: ctx.model,
        action: ctx.action,
        code: 'TARGET_RESOLVED_BY_PREFIX',
        raw,
        resolved,
    });
    return resolved;
}
