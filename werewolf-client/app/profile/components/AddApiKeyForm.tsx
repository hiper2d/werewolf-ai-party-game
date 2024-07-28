'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonTransparentStyle } from "@/app/constants";
import {addApiKey} from "@/app/api/actions";

export default function AddApiKeyForm({ userId }: { userId: string }) {
    const [newKeyType, setNewKeyType] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const router = useRouter();

    const keyTypes = ['Claude 3.5 Sonnet', 'GPT-4o', 'GPT-4', 'Gemini Pro 1.5'];

    const addNewKey = async () => {
        if (newKeyType && newKeyValue) {
            await addApiKey(userId, newKeyType, newKeyValue);
            setNewKeyType('');
            setNewKeyValue('');
            router.refresh(); // This will trigger a re-fetch of the server component
        }
    };

    const isAddButtonDisabled = !newKeyType || !newKeyValue;

    return (
        <div className="flex space-x-4">
            <div className="relative w-64">
                <select
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value)}
                    className="appearance-none bg-gray-700 text-white px-3 py-2 pr-8 rounded w-full"
                >
                    <option value="">Select Key Type</option>
                    {keyTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                    </svg>
                </div>
            </div>
            <input
                type="text"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Enter new key value"
                className="bg-gray-700 text-white px-3 py-2 rounded flex-grow"
            />
            <button
                onClick={addNewKey}
                disabled={isAddButtonDisabled}
                className={`${buttonTransparentStyle} ${isAddButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                Add Key
            </button>
        </div>
    );
}