import React, { useState } from 'react';
import { MultiSelectDropdown } from 'werewolf-client';

const ROLES = ['doctor', 'detective', 'maniac'];
const label = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

/** Two of three special roles selected — the new-game page's roles row. */
export function Selected() {
    const [sel, setSel] = useState(['doctor', 'detective']);
    return <div style={{ width: 340 }}><MultiSelectDropdown options={ROLES} selectedOptions={sel} onChange={setSel} labelFn={label} placeholder="Special roles" /></div>;
}

/** Empty with placeholder, and the error treatment. */
export function EmptyAndError() {
    return (
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <MultiSelectDropdown options={ROLES} selectedOptions={[]} onChange={() => {}} labelFn={label} placeholder="Special roles" />
            <MultiSelectDropdown options={ROLES} selectedOptions={[]} onChange={() => {}} labelFn={label} placeholder="Required" hasError />
        </div>
    );
}
