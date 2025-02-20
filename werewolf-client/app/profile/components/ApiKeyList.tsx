'use client';

import React, {useState} from 'react';
import {deleteApiKey, updateApiKey} from "@/app/api/user-actions";
import {ApiKeyMap} from "@/app/api/game-models";

export default function ApiKeyList({ initialApiKeys, userId }: { initialApiKeys: ApiKeyMap, userId: string }) {
    const [apiKeys, setApiKeys] = useState<ApiKeyMap>(initialApiKeys);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEditing = (model: string, value: string) => {
        setEditingKey(model);
        setEditValue(value);
    };

    const confirmEdit = async (model: string) => {
        await updateApiKey(userId, model, editValue);
        setApiKeys(prev => {
            prev[model] = editValue
            return prev;
        });
        setEditingKey(null);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setEditValue('');
    };

    const deleteKey = async (model: string) => {
        await deleteApiKey(userId, model);
        setApiKeys(prev => {
            const newKeys = { ...prev };
            delete newKeys[model];
            return newKeys;
        });
    };

    return (
        <ul className="space-y-4">
            {Object.entries(apiKeys).map(([model, apiKey]) => (
                <li key={model} className="bg-black bg-opacity-30 p-3 rounded">
                    <div className="flex items-center justify-between">
                        <div className="flex-grow mr-4 flex items-center">
                            <span className="text-gray-300 mr-4 w-48">{model}:</span>
                            <div className="flex-grow">
                                {editingKey === model ? (
                                    <input
                                        type="text"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="bg-gray-700 text-white px-2 py-1 rounded w-full"
                                    />
                                ) : (
                                    <span className="text-white">{apiKey}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center">
                            {editingKey === model ? (
                                <>
                                    <button onClick={() => confirmEdit(model as string)} className="text-green-400 mr-2">
                                        <span className="sr-only">Confirm</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                             xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                                  d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    </button>
                                    <button onClick={cancelEdit} className="text-red-400 mr-2">
                                        <span className="sr-only">Cancel</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                             xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                                  d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => startEditing(model as string, apiKey)} className="text-blue-400 mr-2">
                                    <span className="sr-only">Edit</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                         xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                    </svg>
                                </button>
                            )}
                            <button onClick={() => deleteKey(model as string)} className="text-red-400">
                                <span className="sr-only">Delete</span>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                     xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}
