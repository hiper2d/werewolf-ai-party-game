'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SupportedAiModels, SupportedAiKeyNames, getModelDisplayName, getModelTags, modelHasTag, type ModelTag } from '@/app/ai/ai-models';

interface OptionMeta {
    disabled?: boolean;
    suffix?: string;
}

interface AIModelSelectProps {
    options: string[];
    selectedOptions: string[];
    onChange: (selectedOptions: string[]) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    hasError?: boolean;
    optionMetaFn?: (option: string) => OptionMeta | undefined;
    onFastOnlyChange?: (fastOnly: boolean) => void;
}

const TAG_STYLES: Record<ModelTag, { text: string; border: string; bg: string; label: string }> = {
    'very-fast': { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'very fast' },
    fast: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'fast' },
    slow: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'slow' },
    'very-slow': { text: 'var(--danger)', border: 'oklch(70% 0.13 25 / 0.3)', bg: 'oklch(70% 0.13 25 / 0.08)', label: 'very slow' },
    cheap: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'cheap' },
    'very-cheap': { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'very cheap' },
    expensive: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'expensive' },
};

function CaretIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 5.25L7 8.75L10.5 5.25" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9L12.5 12.5" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5.5L4 7.5L8 3" />
        </svg>
    );
}

function getProviderName(modelId: string): string {
    const config = SupportedAiModels[modelId];
    if (!config) return 'Other';
    return SupportedAiKeyNames[config.apiKeyName] || 'Other';
}

// Provider display order
const PROVIDER_ORDER = ['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Grok', 'Mistral', 'Moonshot'];

export default function AIModelSelect({
    options,
    selectedOptions,
    onChange,
    placeholder = 'Select AI models...',
    className = '',
    disabled = false,
    hasError = false,
    optionMetaFn,
    onFastOnlyChange,
}: AIModelSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [fastOnly, setFastOnly] = useState(false);
    const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isOpen]);

    // Group models by provider
    const groupedModels = useMemo(() => {
        const groups: Record<string, string[]> = {};
        for (const modelId of options) {
            const provider = getProviderName(modelId);
            if (!groups[provider]) groups[provider] = [];
            groups[provider].push(modelId);
        }
        // Sort by predefined order
        const sorted: [string, string[]][] = [];
        for (const p of PROVIDER_ORDER) {
            if (groups[p]) sorted.push([p, groups[p]]);
        }
        // Any remaining providers
        for (const [p, models] of Object.entries(groups)) {
            if (!PROVIDER_ORDER.includes(p)) sorted.push([p, models]);
        }
        return sorted;
    }, [options]);

    // Filter by search and selected providers (fast-only is applied per-row as a disabled state)
    const filteredGroups = useMemo(() => {
        const q = search.toLowerCase();
        return groupedModels
            .map(([provider, models]) => {
                if (selectedProviders.size > 0 && !selectedProviders.has(provider)) {
                    return [provider, []] as [string, string[]];
                }
                const filtered = models.filter(m => {
                    const name = getModelDisplayName(m).toLowerCase();
                    const prov = provider.toLowerCase();
                    const matchesSearch = !q || name.includes(q) || prov.includes(q) || m.toLowerCase().includes(q);
                    return matchesSearch;
                });
                return [provider, filtered] as [string, string[]];
            })
            .filter(([, models]) => models.length > 0);
    }, [groupedModels, search, selectedProviders]);

    const availableProviders = useMemo(() => groupedModels.map(([p]) => p), [groupedModels]);

    const toggleProvider = (provider: string) => {
        setSelectedProviders(prev => {
            const next = new Set(prev);
            if (next.has(provider)) next.delete(provider);
            else next.add(provider);
            return next;
        });
    };

    const visibleCount = filteredGroups.reduce((sum, [, m]) => sum + m.length, 0);

    const handleToggle = (modelId: string) => {
        const meta = optionMetaFn?.(modelId);
        if (meta?.disabled && !selectedOptions.includes(modelId)) return;
        if (selectedOptions.includes(modelId)) {
            onChange(selectedOptions.filter(id => id !== modelId));
        } else {
            onChange([...selectedOptions, modelId]);
        }
    };

    const handleSelectVisible = () => {
        const visibleIds = filteredGroups.flatMap(([, models]) =>
            models.filter(m => {
                const meta = optionMetaFn?.(m);
                return !(meta?.disabled && !selectedOptions.includes(m));
            })
        );
        const merged = new Set([...selectedOptions, ...visibleIds]);
        onChange([...merged]);
    };

    const handleClear = () => {
        onChange([]);
    };

    const isFastOrFaster = (modelId: string) => modelHasTag(modelId, 'fast') || modelHasTag(modelId, 'very-fast');

    const handleFastOnlyToggle = () => {
        const next = !fastOnly;
        setFastOnly(next);
        onFastOnlyChange?.(next);
        if (next) {
            // Auto-select all fast (or faster) models, deselect the rest
            onChange(options.filter(isFastOrFaster));
        }
    };

    // Summary text for trigger
    const getSummary = () => {
        const n = selectedOptions.length;
        if (n === 0) return placeholder;
        if (n === 1) return getModelDisplayName(selectedOptions[0]);
        if (n <= 3) return selectedOptions.map(getModelDisplayName).join(', ');
        return `${n} models selected`;
    };

    return (
        <div className={`relative ${className}`} ref={panelRef}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border text-left transition-all duration-[120ms] ${
                    isOpen
                        ? 'border-[var(--accent-line)] shadow-[0_0_0_3px_var(--accent-soft)]'
                        : hasError
                            ? 'border-[var(--danger)]'
                            : 'border-[var(--line-2)] hover:border-[var(--line-3)]'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                {/* Count badge */}
                <span className="flex-none w-6 h-6 rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] flex items-center justify-center text-[11px] font-mono text-[var(--fg-2)]">
                    {selectedOptions.length}
                </span>

                {/* Summary */}
                <span className={`flex-1 text-[13px] truncate ${selectedOptions.length === 0 ? 'text-[var(--fg-3)]' : 'text-[var(--fg-0)]'}`}>
                    {getSummary()}
                </span>

                {/* Fast-only indicator pill */}
                {fastOnly && (
                    <span className="flex-none text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-line)]">
                        Fast
                    </span>
                )}

                {/* Caret */}
                <CaretIcon className={`flex-none text-[var(--fg-2)] transition-transform duration-[160ms] ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Popover panel */}
            {isOpen && (
                <div className="absolute z-20 w-full mt-1.5 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop animate-in fade-in slide-in-from-top-1 duration-[140ms]"
                    style={{ animation: 'pop 140ms ease-out' }}
                >
                    {/* Search */}
                    <div className="p-2 border-b border-[var(--line-1)]">
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-3)]">
                                <SearchIcon />
                            </span>
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search models or providers..."
                                className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-[var(--bg-2)] border border-[var(--line-2)] rounded-[var(--radius-sm)] text-[var(--fg-0)] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms]"
                            />
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="px-3 py-1.5 border-b border-[var(--line-1)] space-y-1.5">
                        {/* Filter chips: Fast only + provider chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={handleFastOnlyToggle}
                                aria-pressed={fastOnly}
                                className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border transition-all duration-[120ms] ${
                                    fastOnly
                                        ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                                        : 'bg-transparent border-[var(--line-2)] text-[var(--fg-2)] hover:border-[var(--line-3)] hover:text-[var(--fg-1)]'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${fastOnly ? 'bg-[var(--accent)]' : 'bg-[var(--fg-3)]'}`} />
                                Fast only
                            </button>
                            {availableProviders.map(provider => {
                                const active = selectedProviders.has(provider);
                                return (
                                    <button
                                        key={provider}
                                        type="button"
                                        onClick={() => toggleProvider(provider)}
                                        aria-pressed={active}
                                        className={`text-[11px] font-medium px-2 py-1 rounded-full border transition-all duration-[120ms] ${
                                            active
                                                ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                                                : 'bg-transparent border-[var(--line-2)] text-[var(--fg-2)] hover:border-[var(--line-3)] hover:text-[var(--fg-1)]'
                                        }`}
                                    >
                                        {provider}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={handleSelectVisible} className="text-[11px] text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">
                                Select visible
                            </button>
                            <button type="button" onClick={handleClear} className="text-[11px] text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Model list */}
                    <div className="max-h-[280px] overflow-y-auto">
                        {filteredGroups.map(([provider, models]) => (
                            <div key={provider}>
                                {/* Provider header */}
                                <div className="px-3 py-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">
                                    {provider}
                                </div>
                                {models.map(modelId => {
                                    const checked = selectedOptions.includes(modelId);
                                    const meta = optionMetaFn?.(modelId);
                                    const isDisabled = (fastOnly && !isFastOrFaster(modelId)) || (meta?.disabled && !checked);
                                    const tags = getModelTags(modelId);
                                    const config = SupportedAiModels[modelId];

                                    return (
                                        <button
                                            key={modelId}
                                            type="button"
                                            onClick={() => !isDisabled && handleToggle(modelId)}
                                            disabled={isDisabled}
                                            className={`w-full flex items-start gap-2.5 px-3 py-1.5 text-left transition-colors duration-[120ms] ${
                                                isDisabled
                                                    ? 'opacity-40 cursor-not-allowed'
                                                    : 'hover:bg-[var(--bg-3)] cursor-pointer'
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <span className={`flex-none mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all duration-[120ms] ${
                                                checked
                                                    ? 'bg-[var(--accent)] border-[var(--accent)]'
                                                    : 'bg-transparent border-[var(--line-2)]'
                                            }`}>
                                                {checked && <CheckIcon />}
                                            </span>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[13px] font-medium ${checked ? 'text-[var(--fg-0)]' : 'text-[var(--fg-1)]'}`}>
                                                        {getModelDisplayName(modelId)}
                                                    </span>
                                                    {/* Tags */}
                                                    {tags.map(tag => {
                                                        const s = TAG_STYLES[tag];
                                                        return (
                                                            <span
                                                                key={tag}
                                                                className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                                                                style={{ color: s.text, borderColor: s.border, backgroundColor: s.bg }}
                                                            >
                                                                {s.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <div className="text-[11px] font-mono text-[var(--fg-2)]">
                                                    {config?.modelApiName}
                                                    {meta?.suffix && <span className="ml-1.5 text-[var(--fg-3)]">{meta.suffix}</span>}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--line-1)] text-[11px] font-mono text-[var(--fg-2)]">
                        <span>{selectedOptions.length} selected &middot; {visibleCount} shown</span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Popover animation */}
            <style jsx>{`
                @keyframes pop {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
