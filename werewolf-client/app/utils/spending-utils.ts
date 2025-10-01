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
            const normalized: UserMonthlySpending = {
                period,
                amountUSD: parseFloat(amount.toFixed(6))
            };
            return normalized;
        })
        .filter((record): record is UserMonthlySpending => record !== null)
        .sort((a, b) => b.period.localeCompare(a.period));
}
