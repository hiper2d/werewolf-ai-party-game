import React from 'react';
import { RoleCard } from 'werewolf-client';
// The real chalk illustrations, inlined by the preview build's dataurl loader —
// in the app they load from /roles/<role>.jpg.
// eslint-disable-next-line
// @ts-ignore
import werewolfArt from '../../werewolf-client/public/roles/werewolf.jpg';
// @ts-ignore
import doctorArt from '../../werewolf-client/public/roles/doctor.jpg';

/** RoleCard is a fullscreen fixed overlay — same framing trick as CharacterCard:
 * the transform makes this box the containing block for the fixed modal. */
function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ position: 'relative', width: 396, height: 700, transform: 'scale(1)', overflow: 'hidden', borderRadius: 12 }}>
            {children}
        </div>
    );
}

/** First-open card for the player's own secret role. */
export function YourRole() {
    return <Frame><RoleCard role="werewolf" own onClose={() => {}} imageSrc={werewolfArt} /></Frame>;
}

/** The same card opened from a role tag in the players panel. */
export function RoleReference() {
    return <Frame><RoleCard role="doctor" own={false} onClose={() => {}} imageSrc={doctorArt} /></Frame>;
}
