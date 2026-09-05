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
/**
 * True when a paid-tier call was refused because the player's prepaid in-app
 * balance can't cover it (cost-tracking, TTS/STT, image actions all throw the
 * same "Insufficient balance…" wording). Nothing about the model or the game
 * is wrong, so retrying or switching models can't help — only adding funds on
 * the profile page does.
 */
export function isInsufficientBalanceError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return /insufficient balance/i.test(text);
}

/**
 * True when the AI provider refused the call because the PLATFORM's account with
 * that provider is out of money — OpenAI "You have no credits remaining" /
 * insufficient_quota, Anthropic "credit balance is too low", DeepSeek / xAI
 * 402 "Insufficient Balance" / spending-limit wording. All tiers run on platform
 * keys, so this is our budget, not the player's: retrying the same provider
 * can't help until it is topped up, but another provider's model still works.
 * Check this BEFORE isProviderBusyError — these come as 429s too.
 */
export function isProviderBudgetDepletedError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return /no credits remaining|insufficient_quota|exceeded your current quota|credit balance is too low|used all available credits|spending limit|billing hard limit|\b402\b.*insufficient balance|insufficient balance.*\b402\b/i.test(text);
}

export function isProviderBusyError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return /\b429\b|\b529\b|rate[\s_-]?limit|too many requests|at capacity|overloaded|resource[\s_-]?exhausted|quota/i.test(text);
}
