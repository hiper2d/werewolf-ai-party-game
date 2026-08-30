import React, { useState } from 'react';
import { AIModelSelect } from 'werewolf-client';

const MODELS = ['claude-fable', 'claude-sonnet', 'gpt-6', 'gemini-3.7-pro'];
const meta = (m: string) => ({ tags: m.includes('sonnet') || m.includes('gemini') ? ['thinking', 'fast'] : ['thinking'] });

/** The new-game page's players-AI selector with a mixed selection. */
export function Selection() {
    const [sel, setSel] = useState(['claude-fable', 'gpt-6']);
    return <div style={{ width: 380 }}><AIModelSelect options={MODELS} selectedOptions={sel} onChange={setSel} optionMetaFn={meta} placeholder="Player models" /></div>;
}
