'use client';

import React, {useState} from 'react';
import {useRouter} from 'next/navigation';
import {addApiKey} from "@/app/api/user-actions";
import {SupportedAiKeyNames} from "@/app/ai/ai-models";

export default function AddApiKeyForm({ userId }: { userId: string }) {
    const [newKeyType, setNewKeyType] = useState<string | ''>('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const router = useRouter();

    const addNewKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newKeyType && newKeyValue) {
            await addApiKey(userId, newKeyType, newKeyValue);
            setNewKeyType('');
            setNewKeyValue('');
            router.refresh();
        }
    };

    const isAddButtonDisabled = !newKeyType || !newKeyValue;

    return (
        <div className="flex space-x-4">
            <div className="relative w-64">
                <select
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value as string)}
                    className="chat-input w-full h-10"
                >
                    <option value="">Select Key Type</option>
                    {Object.entries(SupportedAiKeyNames).map(([model, name]) => (
                        <option key={model} value={model}>{model} - {name}</option>
                    ))}
                </select>
            </div>
            <input
                type="text"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Enter new key value"
                className="chat-input flex-grow"
            />
            <button
                onClick={addNewKey}
                disabled={isAddButtonDisabled}
                className={`pbtn pbtn-primary pbtn-sm ${isAddButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                ADD KEY
            </button>
        </div>
    );
}
