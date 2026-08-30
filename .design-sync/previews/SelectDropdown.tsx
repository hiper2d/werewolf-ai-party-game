import React, { useState } from 'react';
import { SelectDropdown } from 'werewolf-client';

const options = [
    { value: 'openai', label: 'OpenAI TTS' },
    { value: 'google', label: 'Google Cloud TTS' },
];

/** Closed, with a selection — as on the new-game page's voice provider row. */
export function Closed() {
    const [value, setValue] = useState('openai');
    return <div style={{ width: 320 }}><SelectDropdown options={options} value={value} onChange={setValue} /></div>;
}

/** Disabled state. */
export function Disabled() {
    return <div style={{ width: 320 }}><SelectDropdown options={options} value="google" onChange={() => {}} disabled /></div>;
}
