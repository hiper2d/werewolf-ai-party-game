import {db} from "@/firebase/server";
import {FREE_TIER_LIMITS, FreeTierLimits} from "@/app/api/game-models";

/**
 * Live free-tier limits: the Firestore doc `config/limits` overlaid on the
 * FREE_TIER_LIMITS defaults, cached in-process for a minute. Editing the doc is how a
 * cap gets lowered during a spike without a deploy. Doc shape (every field optional):
 *
 *   { freeDailySpendUSD: 5, freeMonthlySpendUSD: 20, freeGamesPerDay: 5,
 *     freeGlobalDailySpendUSD: 40, freeDeviceDailySpendUSD: 5,
 *     jevScreenMode: 'monitor' }
 *
 * `jevScreenMode` is the switch of the Jev content screen (app/api/jev-screen.ts):
 * 'off' (never called), 'monitor' (called and recorded, never rejects — the default) or
 * 'enforce' (would-block verdicts reject the input). Lives here, not in code, so it can be
 * flipped either way within the cache minute and without a deploy.
 *
 * Setting `freeDeviceDailySpendUSD` to 0 turns the per-device cap off without a deploy,
 * which is the escape hatch if it ever starts refusing legitimate shared-computer users.
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
    globalDailySpendUSD: FREE_TIER_LIMITS.GLOBAL_DAILY_SPEND_USD,
    deviceDailySpendUSD: FREE_TIER_LIMITS.DEVICE_DAILY_SPEND_USD,
};

export type JevScreenMode = 'off' | 'monitor' | 'enforce';
export const DEFAULT_JEV_SCREEN_MODE: JevScreenMode = 'monitor';

/** The raw `config/limits` doc (or undefined when missing / unreadable), cached for a minute. */
let cache: { data: Record<string, any> | undefined; expiresAt: number } | null = null;

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
        globalDailySpendUSD: numberOr(data?.freeGlobalDailySpendUSD, DEFAULT_FREE_TIER_LIMITS.globalDailySpendUSD),
        deviceDailySpendUSD: numberOr(data?.freeDeviceDailySpendUSD, DEFAULT_FREE_TIER_LIMITS.deviceDailySpendUSD),
    };
}

export function jevScreenModeFromConfig(data: Record<string, any> | undefined | null): JevScreenMode {
    const value = data?.jevScreenMode;
    return value === 'off' || value === 'monitor' || value === 'enforce' ? value : DEFAULT_JEV_SCREEN_MODE;
}

async function getLimitsDoc(): Promise<Record<string, any> | undefined> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
        return cache.data;
    }
    if (!db) {
        return undefined;
    }
    let data: Record<string, any> | undefined;
    try {
        const snap = await db.collection('config').doc(LIMITS_DOC).get();
        data = snap.exists ? snap.data() : undefined;
    } catch (error: any) {
        console.error(`Failed to read config/${LIMITS_DOC}, using defaults: ${error?.message ?? error}`);
        data = undefined;
    }
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
}

export async function getFreeTierLimits(): Promise<FreeTierLimits> {
    if (!db) {
        return DEFAULT_FREE_TIER_LIMITS;
    }
    return limitsFromConfig(await getLimitsDoc());
}

export async function getJevScreenMode(): Promise<JevScreenMode> {
    if (!db) {
        return DEFAULT_JEV_SCREEN_MODE;
    }
    return jevScreenModeFromConfig(await getLimitsDoc());
}

/** Test/admin hook: forget the cached doc so the next read hits Firestore. */
export function resetFreeTierLimitsCache(): void {
    cache = null;
}
