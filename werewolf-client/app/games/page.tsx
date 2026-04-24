import Link from 'next/link';
import {getAllGames} from "@/app/api/game-actions";
import RemoveGame from "@/app/games/components/RemoveGame";
import {redirect} from "next/navigation";
import {Game} from "@/app/api/game-models";
import { auth } from "@/auth";
import { getUserTier } from "@/app/api/user-actions";

function formatCreationDate(timestamp?: number): string {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

const GamePages = async ({searchParams}: {searchParams?: Promise<{error?: string; blocked?: string}>}) => {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Fgames');
    }

    const userEmail = session.user?.email;
    if (!userEmail) {
        redirect('/?login=true&callbackUrl=%2Fgames');
    }

    const userTier = await getUserTier(userEmail);
    const games: Game[] = await getAllGames(userEmail);
    const resolvedSearchParams = await searchParams;
    const errorCode = resolvedSearchParams?.error;
    const blockedGameId = resolvedSearchParams?.blocked;
    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ color: 'var(--ember-ink-0)' }}>
            <div className="flex justify-between items-center mb-6">
                <h1 className="pixel-text" style={{ fontSize: 16, color: 'var(--ember-fire-4)' }}>GAME LIST</h1>
                <Link href="/games/newgame" className="pbtn pbtn-primary" style={{ textDecoration: 'none' }}>
                    ▸ CREATE GAME
                </Link>
            </div>

            {errorCode === 'tier_mismatch' && (
                <div className="panel-sm mb-4 p-4" style={{ borderColor: 'var(--ember-fire-4)' }}>
                    <div className="flex items-start justify-between gap-4">
                        <span className="console-text" style={{ fontSize: 14, color: 'var(--ember-fire-4)' }}>
                            You can only open games created on your current tier. {blockedGameId ? `Game ${blockedGameId} is locked.` : ''}
                        </span>
                        <Link
                            href="/games"
                            className="pixel-text"
                            style={{ fontSize: 8, color: 'var(--ember-ink-2)', textDecoration: 'none' }}
                        >
                            DISMISS
                        </Link>
                    </div>
                </div>
            )}

            <div className="flex-grow overflow-auto">
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {games.map((game) => {
                        const isSameTier = game.createdWithTier === userTier;
                        return (
                        <li
                            key={game.id}
                            className="panel-sm"
                            style={{
                                marginBottom: 8,
                                padding: '12px 16px',
                                opacity: isSameTier ? 1 : 0.5,
                                transition: 'opacity 150ms',
                            }}
                        >
                            <div className="flex justify-between items-start gap-2">
                                {isSameTier ? (
                                    <Link href={`/games/${game.id}`} className="flex-grow" style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <GameListEntryContent game={game} />
                                    </Link>
                                ) : (
                                    <div className="flex-grow" style={{ cursor: 'not-allowed' }}>
                                        <GameListEntryContent game={game} locked />
                                        <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-fire-4)', marginTop: 6 }}>
                                            Switch to {game.createdWithTier.toUpperCase()} tier to continue.
                                        </p>
                                    </div>
                                )}
                                <RemoveGame gameId={game.id} ownerEmail={userEmail} />
                            </div>
                        </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

export default GamePages;

function GameListEntryContent({
    game,
    locked = false,
}: {
    game: Game;
    locked?: boolean;
}) {
    const stateLabel = game.gameState.toLowerCase().replace(/_/g, ' ');
    return (
        <div className={`flex flex-col gap-1 ${locked ? 'pointer-events-none' : ''}`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                <h2 className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-ink-0)' }}>
                    {game.theme.toUpperCase()}
                </h2>
                <div className="console-text flex flex-wrap items-center gap-x-2" style={{ fontSize: 13, color: 'var(--ember-ink-3)' }}>
                    <span>{formatCreationDate(game.createdAt)}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ color: 'var(--ember-fire-4)' }}>
                        DAY {game.currentDay} · {stateLabel.toUpperCase()}
                    </span>
                </div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', lineHeight: 1.5, margin: 0 }} className="line-clamp-2">
                {game.description}
            </p>
            <div className="pixel-text" style={{ fontSize: 7, color: 'var(--ember-ink-3)', letterSpacing: 2 }}>
                {game.createdWithTier.toUpperCase()} TIER
            </div>
        </div>
    );
}
