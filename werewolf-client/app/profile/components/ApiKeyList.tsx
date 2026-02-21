'use client';

import React, { useState, useRef, useEffect } from 'react';
import { deleteApiKey, updateApiKey, addApiKey } from "@/app/api/user-actions";
import { ApiKeyMap } from "@/app/api/game-models";
import { SupportedAiKeyNames } from "@/app/ai/ai-models";
import { useRouter } from 'next/navigation';

function maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function getFriendlyName(keyConstant: string): string {
    return SupportedAiKeyNames[keyConstant] || keyConstant;
}

export default function ApiKeyList({ initialApiKeys, userId }: { initialApiKeys: ApiKeyMap; userId: string }) {
    const [apiKeys, setApiKeys] = useState<ApiKeyMap>(initialApiKeys);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addKeyType, setAddKeyType] = useState('');
    const [addKeyValue, setAddKeyValue] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Close modal on outside click
    useEffect(() => {
        if (!editingKey && !isAdding) return;
        const handleClick = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                closeModal();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [editingKey, isAdding]);

    const closeModal = () => {
        setEditingKey(null);
        setEditValue('');
        setIsAdding(false);
        setAddKeyType('');
        setAddKeyValue('');
    };

    const handleSave = async () => {
        if (!editingKey || !editValue.trim()) return;
        await updateApiKey(userId, editingKey, editValue.trim());
        setApiKeys(prev => ({ ...prev, [editingKey]: editValue.trim() }));
        closeModal();
    };

    const handleDelete = async (model: string) => {
        await deleteApiKey(userId, model);
        setApiKeys(prev => {
            const newKeys = { ...prev };
            delete newKeys[model];
            return newKeys;
        });
    };

    const handleAdd = async () => {
        if (!addKeyType || !addKeyValue.trim()) return;
        await addApiKey(userId, addKeyType, addKeyValue.trim());
        setApiKeys(prev => ({ ...prev, [addKeyType]: addKeyValue.trim() }));
        closeModal();
        router.refresh();
    };

    // Providers that don't have a key yet
    const availableProviders = Object.entries(SupportedAiKeyNames).filter(
        ([key]) => !apiKeys[key]
    );

    return (
        <>
            <div className="space-y-2">
                {Object.entries(apiKeys).length === 0 ? (
                    <p className="text-sm theme-text-secondary italic">No API keys configured yet.</p>
                ) : (
                    Object.entries(apiKeys).map(([model, apiKey]) => (
                        <div key={model} className="flex items-center justify-between py-2 border-b theme-border-subtle">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="font-medium text-sm">{getFriendlyName(model)}</span>
                                <span className="text-xs theme-text-secondary font-mono">{maskKey(apiKey)}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => { setEditingKey(model); setEditValue(apiKey); }}
                                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                                    title={`Edit ${getFriendlyName(model)} key`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
                                        <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleDelete(model)}
                                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                                    title={`Delete ${getFriendlyName(model)} key`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add key button */}
            {availableProviders.length > 0 && (
                <button
                    onClick={() => setIsAdding(true)}
                    className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add API Key
                </button>
            )}

            {/* Edit / Add modal */}
            {(editingKey || isAdding) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" />
                    <div
                        ref={modalRef}
                        className="relative bg-[rgb(var(--color-card-bg))] theme-border border rounded-lg p-6 w-full max-w-md mx-4 shadow-xl"
                    >
                        <h3 className="text-lg font-bold mb-4">
                            {isAdding ? 'Add API Key' : `Edit ${getFriendlyName(editingKey!)}`}
                        </h3>

                        {isAdding && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-1">Provider</label>
                                <select
                                    value={addKeyType}
                                    onChange={(e) => setAddKeyType(e.target.value)}
                                    className="w-full p-2 rounded bg-input border border-input-border text-input-text focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select provider...</option>
                                    {availableProviders.map(([key, name]) => (
                                        <option key={key} value={key}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">API Key</label>
                            <input
                                type="text"
                                value={isAdding ? addKeyValue : editValue}
                                onChange={(e) => isAdding ? setAddKeyValue(e.target.value) : setEditValue(e.target.value)}
                                placeholder="Paste your API key here..."
                                className="w-full p-2 rounded bg-input border border-input-border text-input-text placeholder-input-placeholder focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                autoFocus
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-sm rounded theme-border border hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={isAdding ? handleAdd : handleSave}
                                disabled={isAdding ? (!addKeyType || !addKeyValue.trim()) : !editValue.trim()}
                                className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isAdding ? 'Add' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
