import React, { useState } from 'react';
import { ExpandableTextarea } from 'werewolf-client';

// The app always passes its themed input classes via className (see
// newgame/page.tsx inputStyle) — the component ships unstyled without them.
const INPUT = 'w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-0)] text-[13px] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms]';

const STORY = 'A remote mountain village, snowed in for the winter. The last caravan of the season brought a stranger who never gave his name — and the first full moon after his arrival, a shepherd was found at the tree line. The village elders have called everyone to the meeting hall.';

/** Collapsed with content beyond the fold — the new-game description field. */
export function Collapsed() {
    const [value, setValue] = useState(STORY);
    return <div style={{ width: 420 }}><ExpandableTextarea value={value} onChange={e => setValue(e.target.value)} className={INPUT} minHeight={88} placeholder="Describe the setting…" /></div>;
}

/** Empty with placeholder. */
export function Empty() {
    const [value, setValue] = useState('');
    return <div style={{ width: 420 }}><ExpandableTextarea value={value} onChange={e => setValue(e.target.value)} className={INPUT} minHeight={88} placeholder="Describe the setting…" /></div>;
}
