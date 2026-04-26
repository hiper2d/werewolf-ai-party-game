'use client';

import React from 'react';
import SelectDropdown from './SelectDropdown';

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
    const selectOptions = options.map(o => ({
        value: o.model,
        label: o.label,
        displayLabel: o.displayLabel,
        disabled: o.disabled,
    }));

    return (
        <SelectDropdown
            options={selectOptions}
            value={value}
            onChange={onChange}
            className={className}
            disabled={disabled}
        />
    );
}
