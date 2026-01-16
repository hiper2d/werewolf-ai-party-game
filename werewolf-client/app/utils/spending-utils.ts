import {UserMonthlySpending} from "@/app/api/game-models";

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

            const normalized: UserMonthlySpending = {
                period,
                amountUSD: parseFloat(amount.toFixed(6)),
                freeAmountUSD: parseFloat(freeAmount.toFixed(6)),
                apiAmountUSD: parseFloat(apiAmount.toFixed(6))
            };
            return normalized;
        })
        .filter((record): record is UserMonthlySpending => record !== null)
        .sort((a, b) => b.period.localeCompare(a.period));
}
