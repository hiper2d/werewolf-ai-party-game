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
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
                <p className="text-red-500 mb-4">{error.message}</p>
                <button
                    onClick={() => reset()}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}