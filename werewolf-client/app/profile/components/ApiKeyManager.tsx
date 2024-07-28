'use client';

import React, { useState } from 'react';
import { buttonTransparentStyle } from "@/app/constants";

type ApiKey = {
    id: string;
    type: string;
    value: string;
};

const ApiKeyManager = () => {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [newKeyType, setNewKeyType] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const keyTypes = ['Claude 3.5 Sonnet', 'GPT-4o', 'GPT-4', 'Gemini Pro 1.5'];

    const addNewKey = () => {
        if (newKeyType && newKeyValue) {
            setApiKeys([...apiKeys, { id: Date.now().toString(), type: newKeyType, value: newKeyValue }]);
            setNewKeyType('');
            setNewKeyValue('');
        }
    };

    const startEditing = (id: string, value: string) => {
        setEditingKey(id);
        setEditValue(value);
    };

    const confirmEdit = (id: string) => {
        setApiKeys(apiKeys.map(key => key.id === id ? { ...key, value: editValue } : key));
        setEditingKey(null);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setEditValue('');
    };

    const deleteKey = (id: string) => {
        setApiKeys(apiKeys.filter(key => key.id !== id));
    };

    const isAddButtonDisabled = !newKeyType || !newKeyValue;

    return (
        <div className="h-full flex flex-col bg-black bg-opacity-30 border border-white border-opacity-30 rounded">
            <div className="p-4">
                <h2 className="text-2xl font-bold mb-4">API Keys</h2>
            </div>

            <div className="flex-grow overflow-auto p-4">
                <ul className="space-y-4">
                    {apiKeys.map(key => (
                        <li key={key.id} className="bg-black bg-opacity-30 p-3 rounded">
                            <div className="flex items-center justify-between">
                                <div className="flex-grow mr-4 flex items-center">
                                    <span className="text-gray-300 mr-4 w-48">{key.type}:</span>
                                    <div className="flex-grow">
                                        {editingKey === key.id ? (
                                            <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                className="bg-gray-700 text-white px-2 py-1 rounded w-full"
                                            />
                                        ) : (
                                            <span className="text-white">{key.value}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    {editingKey === key.id ? (
                                        <>
                                            <button onClick={() => confirmEdit(key.id)} className="text-green-400 mr-2">
                                                <span className="sr-only">Confirm</span>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                                </svg>
                                            </button>
                                            <button onClick={cancelEdit} className="text-red-400 mr-2">
                                                <span className="sr-only">Cancel</span>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                                </svg>
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => startEditing(key.id, key.value)} className="text-blue-400 mr-2">
                                            <span className="sr-only">Edit</span>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                            </svg>
                                        </button>
                                    )}
                                    <button onClick={() => deleteKey(key.id)} className="text-red-400">
                                        <span className="sr-only">Delete</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="p-4 border-t border-white border-opacity-30">
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
            </div>
        </div>
    );
};

export default ApiKeyManager;