import {FreeTierLimits, UserDailySpend, UserMonthlySpending, UserTier, USER_TIERS} from "@/app/api/game-models";
import {applySpend, evaluateBudget, ledgerSpend, periodKey} from "@hiper2d/ai-agents";
import type {BudgetVerdict} from "@hiper2d/ai-agents";

/**
 * Format a UTC timestamp into the `YYYY-MM` period key used for monthly spending.
 */
export function formatPeriod(timestamp: number): string {
    return periodKey(timestamp, 'month');
}

/**
 * Pure reducer for the user's daily ledger: adds `amountUSD` to today's total and to the
 * tier bucket, starting a fresh ledger (and zeroing `limitHits`) when the UTC day has
 * rolled since the stored one. Delegates to the ai-agents ledger; this wrapper only
 * carries the app's `limitHits` counter across same-day updates.
 */
export function applyDailySpend(
    dailySpend: UserDailySpend | undefined | null,
    timestamp: number,
    amountUSD: number,
    tier?: UserTier
): UserDailySpend {
    const next = applySpend(dailySpend, { window: 'day', amountUSD, bucket: tier, timestamp });
    const sameDay = !!dailySpend && dailySpend.period === next.period;
    return { ...next, limitHits: sameDay ? (Number(dailySpend?.limitHits) || 0) : 0 };
}

/** Free-tier spend recorded for the UTC day containing `timestamp`; 0 when absent or stale. */
export function getFreeDailySpend(dailySpend: UserDailySpend | undefined | null, timestamp: number): number {
    return ledgerSpend(dailySpend, 'day', timestamp, USER_TIERS.FREE);
}

/**
 * The two free-tier budget verdicts — day, then month — for a user doc's ledgers. Pure:
 * both the pre-call guard (user-actions) and the profile page read the same answer.
 */
export function freeSpendVerdicts(
    user: { spendings?: any[]; dailySpend?: UserDailySpend | null } | undefined,
    limits: FreeTierLimits,
    timestamp: number = Date.now()
): BudgetVerdict[] {
    return [
        evaluateBudget(
            getFreeDailySpend(user?.dailySpend, timestamp),
            { window: 'day', limitUSD: limits.dailySpendUSD, bucket: USER_TIERS.FREE },
            timestamp
        ),
        evaluateBudget(
            getFreeSpendForPeriod(user?.spendings, formatPeriod(timestamp)),
            { window: 'month', limitUSD: limits.monthlySpendUSD, bucket: USER_TIERS.FREE },
            timestamp
        ),
    ];
}

/**
 * Pure reducer: add `amountUSD` to the spending record for `period` (creating it
 * if absent) and to the tier-specific bucket, returning a fresh, sorted array.
 * Shared by updateUserMonthlySpending and the atomic charge transaction so the
 * monthly-spending merge logic lives in exactly one tested place.
 */
export function applySpending(
    spendings: any[] | undefined,
    period: string,
    amountUSD: number,
    tier?: UserTier
): UserMonthlySpending[] {
    const current = normalizeSpendings(spendings);
    const normalizedAmount = parseFloat((Number(amountUSD) || 0).toFixed(6));
    if (!(normalizedAmount > 0)) {
        return current;
    }

    let periodUpdated = false;
    const updated = current.map(record => {
        if (record.period !== period) {
            return record;
        }
        periodUpdated = true;

        const newTotal = parseFloat((record.amountUSD + normalizedAmount).toFixed(6));
        let freeAmount = record.freeAmountUSD || 0;
        // Legacy bucket from the retired 'api' tier: preserved verbatim so old months
        // keep reconciling with amountUSD, but never added to.
        const apiAmount = record.apiAmountUSD || 0;
        let paidAmount = record.paidAmountUSD || 0;

        if (tier === 'free') {
            freeAmount = parseFloat((freeAmount + normalizedAmount).toFixed(6));
        } else if (tier === 'paid') {
            paidAmount = parseFloat((paidAmount + normalizedAmount).toFixed(6));
        }

        return {
            period: record.period,
            amountUSD: newTotal,
            freeAmountUSD: freeAmount,
            apiAmountUSD: apiAmount,
            paidAmountUSD: paidAmount
        } as UserMonthlySpending;
    });

    if (!periodUpdated) {
        updated.push({
            period,
            amountUSD: normalizedAmount,
            freeAmountUSD: tier === 'free' ? normalizedAmount : 0,
            apiAmountUSD: 0,
            paidAmountUSD: tier === 'paid' ? normalizedAmount : 0
        });
    }

    updated.sort((a, b) => b.period.localeCompare(a.period));
    return updated;
}

/**
 * Free-tier (platform-key) spend recorded for `period` (YYYY-MM), or 0 if none.
 * Used by the free-tier monthly spend guard.
 */
export function getFreeSpendForPeriod(spendings: any[] | undefined, period: string): number {
    const record = normalizeSpendings(spendings).find(r => r.period === period);
    return record ? (record.freeAmountUSD || 0) : 0;
}

export function normalizeSpendings(spendings: any[] | undefined): UserMonthlySpending[] {
    if (!Array.isArray(spendings)) {
        return [];
    }

    return spendings
        .map(record => {
            const period = typeof record?.period === 'string' ? record.period : '';
            const amount = Number(record?.amountUSD) || 0;
            if (!period) {
                return null;
            }

            // Normalize tier-specific amounts (default to 0 if not present)
            const freeAmount = Number(record?.freeAmountUSD) || 0;
            const apiAmount = Number(record?.apiAmountUSD) || 0;
            const paidAmount = Number(record?.paidAmountUSD) || 0;

            const normalized: UserMonthlySpending = {
                period,
                amountUSD: parseFloat(amount.toFixed(6)),
                freeAmountUSD: parseFloat(freeAmount.toFixed(6)),
                apiAmountUSD: parseFloat(apiAmount.toFixed(6)),
                paidAmountUSD: parseFloat(paidAmount.toFixed(6))
            };
            return normalized;
        })
        .filter((record): record is UserMonthlySpending => record !== null)
        .sort((a, b) => b.period.localeCompare(a.period));
}
