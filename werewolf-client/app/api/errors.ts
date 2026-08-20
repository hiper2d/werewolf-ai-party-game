export class TierMismatchError extends Error {
    code = 'TIER_MISMATCH' as const;
    readonly gameId: string;
    readonly gameTier: string;
    readonly userTier: string;

    constructor(gameId: string, gameTier: string, userTier: string) {
        super('TIER_MISMATCH');
        this.name = 'TierMismatchError';
        this.gameId = gameId;
        this.gameTier = gameTier;
        this.userTier = userTier;
    }
}

export function isTierMismatchError(error: unknown): error is TierMismatchError {
    return error instanceof TierMismatchError || (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'TIER_MISMATCH');
}

/**
 * True when an AI call failed because the provider throttled or ran out of capacity
 * (HTTP 429 / 529, "rate limit", "at capacity", "overloaded", quota exhaustion) rather
 * than anything game-side. Providers differ in where the status text lands — some agents
 * put it in the error message, others (e.g. Anthropic) only in `details` — so callers
 * should test both fields of a SystemErrorMessage.
 */
export function isProviderBusyError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return /\b429\b|\b529\b|rate[\s_-]?limit|too many requests|at capacity|overloaded|resource[\s_-]?exhausted|quota/i.test(text);
}
