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
            <div className="theme-bg-card p-8 rounded-lg theme-shadow theme-border border">
                <h2 className="text-2xl font-bold mb-4 theme-text-primary">Something went wrong!</h2>
                <p className="text-red-600 dark:text-red-400 mb-4">{error.message}</p>
                <button
                    onClick={() => reset()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}