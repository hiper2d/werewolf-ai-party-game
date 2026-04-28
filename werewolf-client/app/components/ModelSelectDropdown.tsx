'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getModelTags, type ModelTag } from '@/app/ai/ai-models';

const TAG_STYLES: Record<ModelTag, { text: string; border: string; bg: string; label: string }> = {
    fast: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'fast' },
    slow: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'slow' },
    'very-slow': { text: 'var(--danger)', border: 'oklch(70% 0.13 25 / 0.3)', bg: 'oklch(70% 0.13 25 / 0.08)', label: 'very slow' },
    cheap: { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'cheap' },
    'very-cheap': { text: 'var(--tag-fast-text)', border: 'var(--tag-fast-border)', bg: 'var(--tag-fast-bg)', label: 'very cheap' },
    expensive: { text: 'var(--tag-std-text)', border: 'var(--tag-std-border)', bg: 'var(--tag-std-bg)', label: 'expensive' },
};

export interface ModelOption {
    model: string;
    disabled: boolean;
    label: string;
    displayLabel: string;
}

interface ModelSelectDropdownProps {
    options: ModelOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
    disabled?: boolean;
}

export default function ModelSelectDropdown({
    options,
    value,
    onChange,
    className = '',
    disabled = false,
}: ModelSelectDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.model === value);
    const displayText = selectedOption?.displayLabel ?? value;

    const handleSelect = (model: string) => {
        onChange(model);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border text-[13px] text-left flex justify-between items-center transition-all duration-[120ms] ${
                    isOpen
                        ? 'border-[var(--accent-line)] shadow-[0_0_0_3px_var(--accent-soft)]'
                        : 'border-[var(--line-2)] hover:border-[var(--line-3)]'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <span className="text-[var(--fg-0)] truncate">{displayText}</span>
                <svg
                    className={`flex-none w-3.5 h-3.5 text-[var(--fg-2)] transition-transform duration-[160ms] ml-2 ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                >
                    <path d="M3.5 5.25L7 8.75L10.5 5.25" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1.5 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop max-h-60 overflow-y-auto">
                    {options.map(({ model, disabled: optDisabled, displayLabel }) => {
                        const tags = getModelTags(model);
                        const isSelected = model === value;
                        return (
                            <button
                                key={model}
                                type="button"
                                onClick={() => !optDisabled && handleSelect(model)}
                                disabled={optDisabled}
                                className={`w-full px-3 py-2 text-left transition-colors duration-[120ms] flex items-center gap-2 ${
                                    optDisabled
                                        ? 'opacity-40 cursor-not-allowed text-[var(--fg-3)]'
                                        : isSelected
                                            ? 'bg-[var(--accent-soft)] text-[var(--fg-0)]'
                                            : 'text-[var(--fg-1)] cursor-pointer hover:bg-[var(--bg-3)] hover:text-[var(--fg-0)]'
                                }`}
                            >
                                <span className="text-[13px] font-medium truncate">{displayLabel}</span>
                                {tags.map(tag => {
                                    const s = TAG_STYLES[tag];
                                    return (
                                        <span
                                            key={tag}
                                            className="flex-none text-[9px] font-mono px-1.5 py-0.5 rounded border"
                                            style={{ color: s.text, borderColor: s.border, backgroundColor: s.bg }}
                                        >
                                            {s.label}
                                        </span>
                                    );
                                })}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
