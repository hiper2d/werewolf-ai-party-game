import React from 'react';
import { CharacterCard } from 'werewolf-client';

// Inline SVG portrait stands in for the generated themed avatars (an authed
// route in the app, unreachable from previews). Designs should always pass
// `avatarUrl` the same way.
const PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340" viewBox="0 0 340 340"><rect width="340" height="340" fill="#2b3242"/><radialGradient id="g" cx="50%" cy="30%" r="80%"><stop offset="0%" stop-color="#3c465c"/><stop offset="100%" stop-color="#232937"/></radialGradient><rect width="340" height="340" fill="url(#g)"/><circle cx="170" cy="128" r="62" fill="#b6c0d2"/><path d="M56 340c10-80 56-112 114-112s104 32 114 112z" fill="#b6c0d2"/></svg>`,
);

const game: any = {
    id: 'preview-game',
    theme: 'A moonlit mountain village',
    gameState: 'DAY_DISCUSSION',
    humanPlayerName: 'You',
    humanPlayerRole: 'villager',
    humanPlayerIsAlive: true,
    createdWithTier: 'paid',
    avatarsStatus: 'ready',
    avatarsVersion: 1,
    avatarVariants: { Miriam: { n: 3, sel: 1 }, Jonas: { n: 3, sel: 0 }, Greta: { n: 8, sel: 2 } },
    avatarVersions: {},
    avatarRegenCount: 0,
    gameMasterAiType: 'claude-sonnet',
    bots: [
        { name: 'Miriam', gender: 'female', isAlive: true, role: 'villager', aiType: 'claude-sonnet', playStyle: 'aggressive_provoker', story: 'The village apothecary, sharp-eyed and sharper-tongued. She knows what everyone buys, and what they are afraid of.' },
        { name: 'Jonas', gender: 'male', isAlive: false, role: 'werewolf', aiType: 'gpt-5.4', playStyle: 'aggressive_provoker', story: 'A woodcutter who came down from the high forest two winters ago and never quite explained why.' },
        { name: 'Greta', gender: 'female', isAlive: true, role: 'villager', aiType: 'claude-sonnet', playStyle: 'aggressive_provoker', story: 'The innkeeper. Hears everything, repeats most of it, and remembers the rest.' },
    ],
};

const noop = () => {};
const never = () => new Promise<any>(() => {});

/** CharacterCard renders as a fullscreen fixed overlay. A transformed ancestor
 * becomes the containing block for fixed positioning, so this frame contains
 * the modal to a card-sized box instead of the (harness-collapsed) viewport. */
function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ position: 'relative', width: 396, height: 560, transform: 'scale(1)', overflow: 'hidden', borderRadius: 12 }}>
            {children}
        </div>
    );
}

/** The owner's view: the poster in a modal, arrows + dots in the top-right chip walk the kept portrait candidates. */
export function Owner() {
    return (
        <Frame>
            <CharacterCard
                game={game}
                name="Miriam"
                onClose={noop}
                isOwner
                avatarUrl={PORTRAIT}
                onSelectVariant={never}
            />
        </Frame>
    );
}

/** Past six candidates the dots give way to a numeric counter. */
export function ManyCandidates() {
    return (
        <Frame>
            <CharacterCard
                game={game}
                name="Greta"
                onClose={noop}
                isOwner
                avatarUrl={PORTRAIT}
                onSelectVariant={never}
            />
        </Frame>
    );
}

/** A dead werewolf at game distance — role revealed, grayscale portrait, DEAD tag. */
export function DeadWerewolf() {
    return <Frame><CharacterCard game={game} name="Jonas" onClose={noop} avatarUrl={PORTRAIT} /></Frame>;
}

/** A spectator's read-only view: no switcher in the chip slot. */
export function ReadOnly() {
    return <Frame><CharacterCard game={game} name="Miriam" onClose={noop} avatarUrl={PORTRAIT} /></Frame>;
}
