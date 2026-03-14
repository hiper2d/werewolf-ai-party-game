import React from 'react';
import { UserMonthlySpending } from '@/app/api/game-models';

interface SpendingsDisplayProps {
    spendings: UserMonthlySpending[];
}

function buildMonthlySpendings(spendings: UserMonthlySpending[]) {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    });

    return Array.from({ length: 5 }, (_, index) => {
        const referenceDate = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - index,
            1
        ));

        const periodKey = `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const match = spendings.find(entry => entry.period === periodKey);

        return {
            label: dateFormatter.format(referenceDate),
            amount: match?.amountUSD ?? 0
        };
    });
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

export default function SpendingsDisplay({ spendings }: SpendingsDisplayProps) {
    const monthly = buildMonthlySpendings(spendings);

    return (
        <div>
            <h3 className="text-lg font-bold mb-2">Monthly Spendings</h3>
            <ul>
                {monthly.map(({ label, amount }) => (
                    <li key={label} className="mb-2 flex justify-between text-sm theme-text-secondary">
                        <span>{label}</span>
                        <span className="font-semibold">{formatCurrency(amount)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
