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
        redirect('/api/auth/signin');
    }

    const userEmail = session.user?.email;
    if (!userEmail) {
        redirect('/api/auth/signin');
    }

    const userTier = await getUserTier(userEmail);
    const games: Game[] = await getAllGames(userEmail);
    const resolvedSearchParams = await searchParams;
    const errorCode = resolvedSearchParams?.error;
    const blockedGameId = resolvedSearchParams?.blocked;
    return (
        <div className="flex flex-col h-full theme-text-primary overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold theme-text-primary">Game List</h1>
                <Link href="/games/newgame" className="text-btn-text bg-btn hover:bg-btn-hover p-3 text-xl rounded">
                    Create Game
                </Link>
            </div>

            {errorCode === 'tier_mismatch' && (
                <div className="mb-4 p-4 border-2 border-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200 rounded flex items-start justify-between gap-4">
                    <div>
                        You can only open games created on your current tier. {blockedGameId ? `Game ${blockedGameId} is locked.` : ''}
                    </div>
                    <Link
                        href="/games"
                        className="text-yellow-800 dark:text-yellow-100 hover:underline text-sm font-medium"
                        aria-label="Dismiss tier warning"
                    >
                        Dismiss
                    </Link>
                </div>
            )}

            <div className="flex-grow overflow-auto">
                <ul className="space-y-4">
                    {games.map((game) => {
                        const isSameTier = game.createdWithTier === userTier;
                        const listClasses = [
                            'theme-bg-card theme-border border rounded-lg px-2 py-4 sm:px-4 transition-colors theme-shadow'
                        ];
                        if (isSameTier) {
                            listClasses.push('hover:opacity-90');
                        } else {
                            listClasses.push('opacity-60');
                        }
                        return (
                        <li
                            key={game.id}
                            className={listClasses.join(' ')}
                        >
                            <div className="flex justify-between items-start gap-2">
                                {isSameTier ? (
                                    <Link href={`/games/${game.id}`} className="flex-grow">
                                        <GameListEntryContent game={game} />
                                    </Link>
                                ) : (
                                    <div className="flex-grow cursor-not-allowed">
                                        <GameListEntryContent game={game} locked />
                                        <p className="mt-2 text-xs text-yellow-800 dark:text-yellow-200">
                                            Switch back to the {game.createdWithTier.toUpperCase()} tier to continue this game.
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
        <div className={`flex flex-col gap-1.5 ${locked ? 'pointer-events-none' : ''}`}>
            {/* Top row: Theme and Date/Status */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                <h2 className="text-lg capitalize theme-text-primary font-semibold truncate">{game.theme}</h2>
                <div className="flex flex-wrap items-center gap-x-2 text-xs theme-text-secondary">
                    <span>{formatCreationDate(game.createdAt)}</span>
                    <span className="hidden sm:inline opacity-40">•</span>
                    <span className="font-medium theme-text-primary uppercase tracking-tight bg-opacity-10 bg-gray-500 px-1.5 py-0.5 rounded sm:bg-transparent sm:p-0">
                        Day {game.currentDay} • {stateLabel}
                    </span>
                </div>
            </div>
            
            {/* Description row: Full width */}
            <p className="text-sm theme-text-secondary line-clamp-2 leading-relaxed">{game.description}</p>
            
            {/* Bottom row: Tier */}
            <div className="text-[10px] uppercase tracking-wider theme-text-secondary opacity-60">
                Tier: {game.createdWithTier}
            </div>
        </div>
    );
}
