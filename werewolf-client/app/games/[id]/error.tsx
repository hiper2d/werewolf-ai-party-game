'use client';

import {useEffect} from 'react';

export default function Error({error, reset}: {
    error: Error;
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="bg-[var(--bg-1)] p-8 rounded-[var(--radius-xl)] shadow-card border border-[var(--line-1)]">
                <h2 className="text-[20px] font-semibold text-[var(--fg-0)] mb-4">Something went wrong!</h2>
                <p className="text-[var(--danger)] text-[13px] mb-4">{error.message}</p>
                <button
                    onClick={() => reset()}
                    className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110 transition-all duration-[120ms]"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
