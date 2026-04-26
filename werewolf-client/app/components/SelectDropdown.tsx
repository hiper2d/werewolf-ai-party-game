'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
    value: string;
    label: string;
    displayLabel?: string; // shown when selected (defaults to label)
    disabled?: boolean;
}

interface SelectDropdownProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export default function SelectDropdown({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    className = '',
    disabled = false,
}: SelectDropdownProps) {
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

    const selected = options.find(o => o.value === value);
    const displayText = selected?.displayLabel ?? selected?.label ?? placeholder;

    const handleSelect = (val: string) => {
        onChange(val);
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
                <span className={`truncate ${selected ? 'text-[var(--fg-0)]' : 'text-[var(--fg-3)]'}`}>
                    {displayText}
                </span>
                <svg
                    className={`flex-none w-3.5 h-3.5 text-[var(--fg-2)] transition-transform duration-[160ms] ml-2 ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                >
                    <path d="M3.5 5.25L7 8.75L10.5 5.25" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1.5 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop max-h-60 overflow-y-auto">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => !opt.disabled && handleSelect(opt.value)}
                            disabled={opt.disabled}
                            className={`w-full px-3 py-2 text-[13px] text-left transition-colors duration-[120ms] ${
                                opt.disabled
                                    ? 'opacity-40 cursor-not-allowed text-[var(--fg-3)]'
                                    : opt.value === value
                                        ? 'bg-[var(--accent-soft)] text-[var(--fg-0)]'
                                        : 'text-[var(--fg-1)] cursor-pointer hover:bg-[var(--bg-3)] hover:text-[var(--fg-0)]'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
