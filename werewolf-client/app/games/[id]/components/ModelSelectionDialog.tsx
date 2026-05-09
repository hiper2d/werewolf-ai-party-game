'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LLM_CONSTANTS, SupportedAiModels, getModelDisplayName, getModelTags, type ModelTag } from '@/app/ai/ai-models';
import { getCandidateModelsForTier, getPerGameModelLimit, FREE_TIER_UNLIMITED } from '@/app/ai/model-limit-utils';
import { UserTier, USER_TIERS } from '@/app/api/game-models';
import { useUIControls } from '../context/UIControlsContext';

const TAG_STYLES: Record<ModelTag, { text: string; border: string; bg: string; label: string }> = {
    fast: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'fast' },
    slow: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'slow' },
    'very-slow': { text: 'var(--danger)', border: 'oklch(70% 0.13 25 / 0.3)', bg: 'oklch(70% 0.13 25 / 0.08)', label: 'very slow' },
    cheap: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'cheap' },
    expensive: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'expensive' },
};

interface ModelSelectionDialogProps {
    onClose: () => void;
    onSelect: (model: string, enableThinking?: boolean) => void;
    currentModel: string;
    currentThinkingMode?: boolean;
    botName: string;
    gameTier: UserTier;
    usageCounts: Record<string, number>;
}

export default function ModelSelectionDialog({
    onClose,
    onSelect,
    currentModel,
    botName,
    gameTier,
    usageCounts
}: ModelSelectionDialogProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('modelSelection');
    const [search, setSearch] = useState('');
    const [providedKeyNames, setProvidedKeyNames] = useState<Set<string> | null>(null);

    // Load API-tier user's provided key names (only relevant when gameTier === API).
    useEffect(() => {
        if (gameTier !== USER_TIERS.API || !isOpen || providedKeyNames !== null) return;
        let cancelled = false;
        fetch('/api/user-key-names')
            .then(r => r.ok ? r.json() : { providedKeys: [] })
            .then(data => {
                if (cancelled) return;
                const list = Array.isArray(data?.providedKeys) ? data.providedKeys as string[] : [];
                setProvidedKeyNames(new Set(list));
            })
            .catch(() => {
                if (!cancelled) setProvidedKeyNames(new Set());
            });
        return () => { cancelled = true; };
    }, [gameTier, isOpen, providedKeyNames]);

    const tierFilteredModels = useMemo(() => {
        if (gameTier === USER_TIERS.FREE) {
            const models = new Set(getCandidateModelsForTier(USER_TIERS.FREE));
            if (currentModel && currentModel !== '' && currentModel !== LLM_CONSTANTS.RANDOM) {
                models.add(currentModel);
            }
            return Array.from(models);
        }
        const all = Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM);
        if (gameTier !== USER_TIERS.API) return all;
        // API tier: filter to vendors the user has keys for. Always allow the currently-selected
        // model so the user can see what they're switching from even if it's now unsupported.
        if (providedKeyNames === null) {
            // Keys not yet loaded — show only the current model to avoid flashing the full list.
            return currentModel ? [currentModel] : [];
        }
        const filtered = all.filter(modelId => {
            const config = SupportedAiModels[modelId];
            return !!config && providedKeyNames.has(config.apiKeyName);
        });
        if (currentModel && currentModel !== LLM_CONSTANTS.RANDOM && !filtered.includes(currentModel)) {
            filtered.push(currentModel);
        }
        return filtered;
    }, [gameTier, currentModel, providedKeyNames]);

    const modelOptions = useMemo(() => {
        return tierFilteredModels
            .map(model => {
                if (gameTier !== USER_TIERS.FREE) {
                    return { model, disabled: false };
                }
                if (model === LLM_CONSTANTS.RANDOM) {
                    return { model, disabled: true };
                }
                let disabled = false;
                try {
                    const limit = getPerGameModelLimit(model, USER_TIERS.FREE);
                    if (limit !== FREE_TIER_UNLIMITED) {
                        const used = usageCounts[model] ?? 0;
                        const adjustedUsage = model === currentModel ? Math.max(0, used - 1) : used;
                        const remaining = Math.max(0, limit - adjustedUsage);
                        disabled = remaining === 0;
                    }
                } catch {
                    disabled = model !== currentModel;
                }
                return { model, disabled };
            })
            .filter(option => !(option.disabled && option.model !== currentModel));
    }, [tierFilteredModels, usageCounts, gameTier, currentModel]);

    // Group by provider
    const groupedModels = useMemo(() => {
        const groups: Record<string, typeof modelOptions> = {};
        const providerNames: Record<string, string> = {
            ANTHROPIC_API_KEY: 'Anthropic', OPENAI_API_KEY: 'OpenAI', GOOGLE_API_KEY: 'Google',
            DEEPSEEK_API_KEY: 'DeepSeek', GROK_API_KEY: 'Grok', MISTRAL_API_KEY: 'Mistral', MOONSHOT_API_KEY: 'Moonshot',
            Z_AI_API_KEY: 'Z.AI'
        };
        for (const opt of modelOptions) {
            const config = SupportedAiModels[opt.model];
            const provider = config ? (providerNames[config.apiKeyName] || 'Other') : 'Other';
            if (!groups[provider]) groups[provider] = [];
            groups[provider].push(opt);
        }
        return Object.entries(groups);
    }, [modelOptions]);

    // Filter by search
    const filteredGroups = useMemo(() => {
        const q = search.toLowerCase();
        if (!q) return groupedModels;
        return groupedModels
            .map(([provider, models]) => [provider, models.filter(m => {
                const name = getModelDisplayName(m.model).toLowerCase();
                return name.includes(q) || provider.toLowerCase().includes(q);
            })] as [string, typeof modelOptions])
            .filter(([, models]) => models.length > 0);
    }, [groupedModels, search]);

    const selectableModels = useMemo(() => modelOptions.filter(o => !o.disabled).map(o => o.model), [modelOptions]);

    const hasThinkingMode = (aiType: string): boolean => {
        return SupportedAiModels[aiType]?.hasThinking === true;
    };

    const [selectedModel, setSelectedModel] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const fallbackModel = selectableModels[0] ?? modelOptions[0]?.model ?? '';
            const validModel = currentModel && modelOptions.some(o => o.model === currentModel)
                ? currentModel : fallbackModel;
            setSelectedModel(validModel ?? '');
            setSearch('');
        }
    }, [isOpen, currentModel, modelOptions, selectableModels]);

    const handleConfirm = async () => {
        if (!selectedModel || (currentModel && selectedModel === currentModel)) {
            onClose();
            return;
        }
        setIsUpdating(true);
        try {
            await onSelect(selectedModel, hasThinkingMode(selectedModel));
            onClose();
        } catch (error) {
            console.error('Error updating model:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] p-0 max-w-lg w-full mx-4 shadow-pop" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line-1)]">
                    <div>
                        <h3 className="text-[16px] font-semibold text-[var(--fg-0)]">Change AI Model</h3>
                        <p className="text-[12px] text-[var(--fg-2)] mt-0.5">
                            {botName} &middot; Currently: <span className="font-mono">{getModelDisplayName(currentModel)}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-[var(--radius-md)] hover:bg-[var(--bg-3)] text-[var(--fg-2)] flex items-center justify-center transition-colors duration-[120ms]">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-[var(--line-1)]">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search models..."
                        className="w-full px-3 py-1.5 text-[13px] bg-[var(--bg-2)] border border-[var(--line-2)] rounded-[var(--radius-sm)] text-[var(--fg-0)] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms]"
                        autoFocus
                    />
                </div>

                {/* Model list */}
                <div className="max-h-[340px] overflow-y-auto px-2 py-2">
                    {filteredGroups.map(([provider, models]) => (
                        <div key={provider}>
                            <div className="px-3 py-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">
                                {provider}
                            </div>
                            {models.map(({ model, disabled: optDisabled }) => {
                                const isSelected = model === selectedModel;
                                const tags = getModelTags(model);
                                const config = SupportedAiModels[model];
                                return (
                                    <button
                                        key={model}
                                        type="button"
                                        onClick={() => !optDisabled && setSelectedModel(model)}
                                        disabled={optDisabled}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] transition-all duration-[120ms] ${
                                            optDisabled ? 'opacity-40 cursor-not-allowed' :
                                            isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-3)] cursor-pointer'
                                        }`}
                                    >
                                        {/* Radio circle */}
                                        <span className={`flex-none w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-[120ms] ${
                                            isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--line-2)]'
                                        }`}>
                                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                                        </span>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[13px] font-medium ${isSelected ? 'text-[var(--fg-0)]' : 'text-[var(--fg-1)]'}`}>
                                                    {getModelDisplayName(model)}
                                                </span>
                                                {tags.map(tag => {
                                                    const s = TAG_STYLES[tag];
                                                    return (
                                                        <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                                                            style={{ color: s.text, borderColor: s.border, backgroundColor: s.bg }}>
                                                            {s.label}
                                                        </span>
                                                    );
                                                })}
                                                {config?.hasThinking && (
                                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]">
                                                        thinking
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--line-1)]">
                    <button
                        onClick={onClose}
                        disabled={isUpdating}
                        className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isUpdating || selectedModel === currentModel}
                        className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110 transition-all duration-[120ms] ${isUpdating || selectedModel === currentModel ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isUpdating ? 'Updating...' : 'Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
