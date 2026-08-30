import React, { useState } from 'react';
import { ModelSelectDropdown } from 'werewolf-client';

const options = [
    { model: 'claude-fable', label: 'Claude Fable 5', displayLabel: 'Claude Fable 5', disabled: false },
    { model: 'claude-sonnet', label: 'Claude 5 Sonnet', displayLabel: 'Claude 5 Sonnet', disabled: false },
    { model: 'claude-opus', label: 'Claude 5 Opus', displayLabel: 'Claude 5 Opus', disabled: false },
];

/** Closed with a selected model — as in the players panel's model chooser. */
export function Closed() {
    const [value, setValue] = useState('claude-sonnet');
    return <div style={{ width: 340 }}><ModelSelectDropdown options={options} value={value} onChange={setValue} /></div>;
}
