import {db} from "@/firebase/server";
import {FREE_TIER_LIMITS, FreeTierLimits} from "@/app/api/game-models";

/**
 * Live free-tier limits: the Firestore doc `config/limits` overlaid on the
 * FREE_TIER_LIMITS defaults, cached in-process for a minute. Editing the doc is how a
 * cap gets lowered during a spike without a deploy. Doc shape (every field optional):
 *
 *   { freeDailySpendUSD: 5, freeMonthlySpendUSD: 20, freeGamesPerDay: 5 }
 *
 * A missing doc, a missing field, or an unreadable value falls back to the default for
 * that field; a read failure falls back to the defaults entirely (and is logged), so a
 * config hiccup can never turn the caps off or lock everyone out.
 */
const LIMITS_DOC = 'limits';
const CACHE_TTL_MS = 60_000;

export const DEFAULT_FREE_TIER_LIMITS: FreeTierLimits = {
    gamesPerDay: FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY,
    dailySpendUSD: FREE_TIER_LIMITS.DAILY_SPEND_USD,
    monthlySpendUSD: FREE_TIER_LIMITS.MONTHLY_SPEND_USD,
};

let cache: { value: FreeTierLimits; expiresAt: number } | null = null;

function numberOr(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function limitsFromConfig(data: Record<string, any> | undefined | null): FreeTierLimits {
    return {
        gamesPerDay: numberOr(data?.freeGamesPerDay, DEFAULT_FREE_TIER_LIMITS.gamesPerDay),
        dailySpendUSD: numberOr(data?.freeDailySpendUSD, DEFAULT_FREE_TIER_LIMITS.dailySpendUSD),
        monthlySpendUSD: numberOr(data?.freeMonthlySpendUSD, DEFAULT_FREE_TIER_LIMITS.monthlySpendUSD),
    };
}

export async function getFreeTierLimits(): Promise<FreeTierLimits> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
        return cache.value;
    }
    if (!db) {
        return DEFAULT_FREE_TIER_LIMITS;
    }
    let value = DEFAULT_FREE_TIER_LIMITS;
    try {
        const snap = await db.collection('config').doc(LIMITS_DOC).get();
        value = limitsFromConfig(snap.exists ? snap.data() : undefined);
    } catch (error: any) {
        console.error(`Failed to read config/${LIMITS_DOC}, using default free-tier limits: ${error?.message ?? error}`);
    }
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
}

/** Test/admin hook: forget the cached doc so the next read hits Firestore. */
export function resetFreeTierLimitsCache(): void {
    cache = null;
}
