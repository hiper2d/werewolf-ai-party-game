import { ModelRefusalError, type BudgetVerdict } from '@hiper2d/ai-agents';

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

/**
 * Free-tier spend cap refusal (the $/day and $/month caps on platform-key spend, see
 * FREE_TIER_LIMITS). Thrown by the pre-call guard before anything is sent to a
 * provider, so nothing was spent and nothing is retryable until `verdict.resetsAt`.
 * The message is what the player sees; `isFreeSpendLimitError` recognizes it after the
 * string round trip through `game.errorState`, so keep the wording in
 * `freeSpendLimitMessage` and the regex in sync.
 */
export class FreeSpendLimitError extends Error {
    code = 'FREE_SPEND_LIMIT' as const;
    readonly verdict: BudgetVerdict;
    readonly scope: SpendLimitScope;

    constructor(verdict: BudgetVerdict, scope: SpendLimitScope = 'account') {
        super(freeSpendLimitMessage(verdict, scope));
        this.name = 'FreeSpendLimitError';
        this.verdict = verdict;
        this.scope = scope;
    }
}

/**
 * Which ceiling refused. All three are the same class of refusal to the caller (nothing
 * was spent, retry after `resetsAt`), but the player-facing copy has to differ: telling
 * someone who spent 40 cents that they "used today's free $40" would read as a bug.
 */
export type SpendLimitScope = 'account' | 'device' | 'device-shared' | 'global';

/** "$5" for whole dollars, "$2.50" otherwise — the free-tier cap as it reads in copy. */
export function formatLimitUSD(amount: number): string {
    return `$${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

export function freeSpendLimitMessage(
    verdict: Pick<BudgetVerdict, 'window' | 'limitUSD'>,
    scope: SpendLimitScope = 'account'
): string {
    const limit = formatLimitUSD(verdict.limitUSD);
    if (scope === 'global') {
        // Deliberately does not quote the platform budget or the player's own spend:
        // this refusal is not about them, and naming the number invites probing it.
        return `Free play is paused for today - the shared daily AI budget is used up. It resets at midnight UTC, or add funds on your profile page to keep playing now.`;
    }
    // 'device' and 'device-shared' deliberately fall through to the ACCOUNT day wording.
    //
    // Naming the browser would hand a farmer the bypass: "this browser has used..." tells
    // them precisely which axis to change, turning "why am I blocked" into "open
    // incognito" with no experiment needed. The honest version was written first and
    // rejected on 2026-09-13 - it was protecting a hypothetical shared-computer user
    // against a confirmed farmer, and every multi-account device on record so far is the
    // latter. Revisit if the data ever shows real shared machines.
    //
    // The distinction is NOT lost, it moves to the log: the thrown FreeSpendLimitError
    // still carries `scope`, and assertFreeSpendWithinLimit warns with it, so ops can
    // tell the three apart even though the player cannot.
    return verdict.window === 'day'
        ? `You've used today's free ${limit} of AI. Come back after midnight UTC, or add funds on your profile page to keep playing now.`
        : `You've used this month's free ${limit} of AI. It resets on the 1st, or add funds on your profile page to keep playing now.`;
}

export function isFreeSpendLimitError(text: string | undefined | null): boolean {
    if (!text) {
        return false;
    }
    return /(today's|this month's) free \$[\d.]+ of AI|free play is paused for today/i.test(text);
}

/**
 * What the PLAYER should be shown, recovered from the message text. The error only
 * reaches the UI as a string (it round-trips through `game.errorState`), so this is all
 * the UI can know - keep it in sync with `freeSpendLimitMessage`.
 *
 * Only 'account' and 'global' are ever returned, by design: the device ceilings render as
 * an ordinary daily limit so the copy never names the axis a farmer would change. The
 * true scope is on the thrown error and in the server log, not here.
 */
export function freeSpendLimitScope(text: string | undefined | null): 'account' | 'global' | undefined {
    if (!isFreeSpendLimitError(text)) {
        return undefined;
    }
    return /free play is paused for today/i.test(text!) ? 'global' : 'account';
}

/** Which cap refused, for copy that differs by window; undefined when the text is not a cap refusal. */
export function freeSpendLimitWindow(text: string | undefined | null): 'day' | 'month' | undefined {
    if (!isFreeSpendLimitError(text)) {
        return undefined;
    }
    return /today's free|paused for today/i.test(text!) ? 'day' : 'month';
}

/**
 * A content-filter refusal, recognized from the message text after the string round trip
 * through `game.errorState`. The wording is the library's (`ModelRefusalError`): Anthropic
 * "refused to answer (stop_reason: refusal)", Gemini "refused the prompt (blockReason:
 * PROHIBITED_CONTENT)" / "refused to answer (finishReason: SAFETY…)", Qwen "refused the prompt
 * (refusalReason: DataInspectionFailed…)". Keep in sync with `@hiper2d/ai-agents` errors.ts,
 * google-agent.ts and qwen-agent.ts.
 */
const MODEL_REFUSAL_RE = /refused (?:the prompt|to answer) \((?:blockReason|finishReason|stop_reason|refusalReason): ([A-Za-z_]+)/;

export function isModelRefusalError(text: string | undefined | null): boolean {
    return !!text && MODEL_REFUSAL_RE.test(text);
}

/** The provider's own label for the refusal ("PROHIBITED_CONTENT", "SAFETY", "refusal"), if the text is one. */
export function modelRefusalReason(text: string | undefined | null): string | undefined {
    return text ? MODEL_REFUSAL_RE.exec(text)?.[1] : undefined;
}

/**
 * Whether a caught error is a model refusal, and why. Three shapes reach the action
 * wrapper: the library's ModelRefusalError itself (talk paths rethrow agent errors
 * as-is), a BotResponseError the vote/night paths wrap it in (message kept verbatim,
 * `context.originalError` = the class name), or a plain Error carrying the message.
 */
export function refusalOf(error: unknown): { reason?: string } | undefined {
    if (error instanceof ModelRefusalError) {
        return { reason: error.reason ?? modelRefusalReason(error.message) };
    }
    if (typeof error === 'object' && error !== null) {
        const message = (error as any).message as string | undefined;
        const details = (error as any).details as string | undefined;
        const wrappedName = (error as any).context?.originalError as string | undefined;
        if (wrappedName === 'ModelRefusalError' || isModelRefusalError(message) || isModelRefusalError(details)) {
            return { reason: modelRefusalReason(message) ?? modelRefusalReason(details) };
        }
    }
    return undefined;
}
