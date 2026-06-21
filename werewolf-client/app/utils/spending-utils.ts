import {UserMonthlySpending, UserTier} from "@/app/api/game-models";

/**
 * Format a UTC timestamp into the `YYYY-MM` period key used for monthly spending.
 */
export function formatPeriod(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
        let apiAmount = record.apiAmountUSD || 0;
        let paidAmount = record.paidAmountUSD || 0;

        if (tier === 'free') {
            freeAmount = parseFloat((freeAmount + normalizedAmount).toFixed(6));
        } else if (tier === 'api') {
            apiAmount = parseFloat((apiAmount + normalizedAmount).toFixed(6));
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
            apiAmountUSD: tier === 'api' ? normalizedAmount : 0,
            paidAmountUSD: tier === 'paid' ? normalizedAmount : 0
        });
    }

    updated.sort((a, b) => b.period.localeCompare(a.period));
    return updated;
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
