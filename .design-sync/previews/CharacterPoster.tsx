import React from 'react';
import { CharacterPoster } from 'werewolf-client';

// Inline SVG portrait stands in for the generated themed avatars (an authed
// route in the app, unreachable from previews). Designs should always pass
// `avatarUrl` the same way.
const PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="493" viewBox="0 0 340 493"><rect width="340" height="493" fill="#2b3242"/><radialGradient id="g" cx="50%" cy="30%" r="80%"><stop offset="0%" stop-color="#3c465c"/><stop offset="100%" stop-color="#232937"/></radialGradient><rect width="340" height="493" fill="url(#g)"/><circle cx="170" cy="150" r="62" fill="#b6c0d2"/><path d="M56 493c10-120 56-172 114-172s104 52 114 172z" fill="#b6c0d2"/></svg>`,
);

const game: any = {
    id: 'preview-game',
    theme: 'A moonlit mountain village',
    gameState: 'DAY_DISCUSSION',
    humanPlayerName: 'You',
    humanPlayerRole: 'detective',
    humanPlayerIsAlive: true,
    createdWithTier: 'paid',
    avatarsStatus: 'ready',
    avatarsVersion: 1,
    gameMasterAiType: 'claude-sonnet',
    bots: [
        { name: 'Miriam', gender: 'female', isAlive: true, role: 'villager', aiType: 'claude-sonnet', playStyle: 'aggressive_provoker', story: 'The village apothecary, sharp-eyed and sharper-tongued. She knows what everyone buys, and what they are afraid of.' },
        { name: 'Jonas', gender: 'male', isAlive: false, role: 'werewolf', aiType: 'gpt-5.4', playStyle: 'aggressive_provoker', story: 'A woodcutter who came down from the high forest two winters ago and never quite explained why.' },
    ],
};

const Frame = ({ children }: { children: React.ReactNode }) => <div style={{ width: 300 }}>{children}</div>;

/** A living crew member as cinematic mode shows them: turn counter chip, cost line. */
export function Crew() {
    return (
        <Frame>
            <CharacterPoster game={game} name="Miriam" avatarUrl={PORTRAIT} cost={0.0097} cornerChip={<span style={{ padding: '4px 9px' }}>3 / 6</span>} />
        </Frame>
    );
}

/** A dead werewolf — role revealed, red tint, grayscale portrait, ✝ after the name. */
export function DeadWerewolf() {
    return <Frame><CharacterPoster game={game} name="Jonas" avatarUrl={PORTRAIT} /></Frame>;
}

/** The human player: YOU · role chip, no play style. */
export function You() {
    return <Frame><CharacterPoster game={game} name="You" avatarUrl={PORTRAIT} /></Frame>;
}

/** The Game Master: green tint, no role, no cost. */
export function GameMaster() {
    return <Frame><CharacterPoster game={game} name="Game Master" avatarUrl={PORTRAIT} /></Frame>;
}
