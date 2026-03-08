'use client';

import React, {useState, useRef, useEffect} from 'react';

export interface ModelOption {
    model: string;
    disabled: boolean;
    label: string;        // shown in dropdown list (with counter)
    displayLabel: string; // shown when selected (plain name)
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
                className={`w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50 text-left flex justify-between items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <span className="text-white truncate">{displayText}</span>
                <span className={`transform transition-transform ml-2 text-xs ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {options.map(({ model, disabled: optDisabled, label }) => (
                        <div
                            key={model}
                            onClick={() => !optDisabled && handleSelect(model)}
                            className={`p-2 ${
                                optDisabled
                                    ? 'opacity-40 cursor-not-allowed text-gray-500'
                                    : model === value
                                        ? 'bg-gray-700 text-white cursor-pointer'
                                        : 'text-white cursor-pointer hover:bg-gray-800'
                            }`}
                        >
                            {label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
