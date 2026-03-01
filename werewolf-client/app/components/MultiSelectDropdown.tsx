'use client';

import React, {useState, useRef, useEffect} from 'react';

interface MultiSelectDropdownProps {
    options: string[];
    selectedOptions: string[];
    onChange: (selectedOptions: string[]) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    hasError?: boolean;
    labelFn?: (option: string) => string;
}

export default function MultiSelectDropdown({
    options,
    selectedOptions,
    onChange,
    placeholder = 'Select options...',
    className = '',
    disabled = false,
    hasError = false,
    labelFn = (o: string) => o
}: MultiSelectDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleToggleOption = (option: string) => {
        if (selectedOptions.includes(option)) {
            onChange(selectedOptions.filter(item => item !== option));
        } else {
            onChange([...selectedOptions, option]);
        }
    };

    const handleSelectAll = () => {
        if (selectedOptions.length === options.length) {
            onChange([]);
        } else {
            onChange([...options]);
        }
    };

    const getDisplayText = () => {
        if (selectedOptions.length === 0) {
            return placeholder;
        } else if (selectedOptions.length === options.length) {
            return 'All Models Selected';
        } else if (selectedOptions.length === 1) {
            return labelFn(selectedOptions[0]);
        } else {
            return `${selectedOptions.length} Models Selected`;
        }
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full p-2 rounded bg-black bg-opacity-30 text-white border ${hasError ? 'border-red-500' : 'border-white border-opacity-30'} focus:outline-none focus:border-white focus:border-opacity-50 text-left flex justify-between items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <span className={selectedOptions.length === 0 ? 'text-gray-400' : 'text-white'}>
                    {getDisplayText()}
                </span>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 border-b border-gray-600">
                        <label className="flex items-center cursor-pointer hover:bg-gray-800 p-1 rounded">
                            <input
                                type="checkbox"
                                checked={selectedOptions.length === options.length}
                                onChange={handleSelectAll}
                                className="mr-2 text-blue-500"
                            />
                            <span className="text-white font-medium">
                                {selectedOptions.length === options.length ? 'Deselect All' : 'Select All'}
                            </span>
                        </label>
                    </div>
                    {options.map((option) => (
                        <label
                            key={option}
                            className="flex items-center cursor-pointer hover:bg-gray-800 p-2"
                        >
                            <input
                                type="checkbox"
                                checked={selectedOptions.includes(option)}
                                onChange={() => handleToggleOption(option)}
                                className="mr-2 text-blue-500"
                            />
                            <span className="text-white">{labelFn(option)}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}