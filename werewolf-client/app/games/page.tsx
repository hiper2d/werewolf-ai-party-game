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
    const games: Game[] = await getAllGames();
    const resolvedSearchParams = await searchParams;
    const errorCode = resolvedSearchParams?.error;
    const blockedGameId = resolvedSearchParams?.blocked;
    return (
        <div className="flex flex-col h-full text-white overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Game List</h1>
                <Link href="/games/newgame" className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl rounded">
                    Create Game
                </Link>
            </div>

            {errorCode === 'tier_mismatch' && (
                <div className="mb-4 p-4 border border-yellow-500 bg-yellow-900/40 text-yellow-200 rounded flex items-start justify-between gap-4">
                    <div>
                        You can only open games created on your current tier. {blockedGameId ? `Game ${blockedGameId} is locked.` : ''}
                    </div>
                    <Link
                        href="/games"
                        className="text-yellow-100 hover:text-white text-sm underline"
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
                            'border border-white border-opacity-30 rounded-lg p-4 transition-colors'
                        ];
                        if (isSameTier) {
                            listClasses.push('hover:bg-white/5');
                        } else {
                            listClasses.push('opacity-60');
                        }
                        return (
                        <li
                            key={game.id}
                            className={listClasses.join(' ')}
                        >
                            <div className="flex justify-between items-start gap-4">
                                {isSameTier ? (
                                    <Link href={`/games/${game.id}`} className="flex-grow">
                                        <GameListEntryContent game={game} />
                                    </Link>
                                ) : (
                                    <div className="flex-grow cursor-not-allowed">
                                        <GameListEntryContent game={game} locked />
                                        <p className="mt-2 text-xs text-yellow-200">
                                            Switch back to the {game.createdWithTier.toUpperCase()} tier to continue this game.
                                        </p>
                                    </div>
                                )}
                                <RemoveGame gameId={game.id} />
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
        <div className={`flex flex-col ${locked ? 'pointer-events-none' : ''}`}>
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <h2 className="text-lg capitalize text-white font-semibold">{game.theme}</h2>
                    <p className="text-sm text-gray-300 mt-1">{game.description}</p>
                </div>
                <div className="text-right whitespace-nowrap text-xs text-gray-400">
                    <div>{formatCreationDate(game.createdAt)}</div>
                    <div className="mt-1">
                        Day {game.currentDay} • {stateLabel}
                    </div>
                    <div className="mt-1">Tier: {game.createdWithTier.toUpperCase()}</div>
                </div>
            </div>
        </div>
    );
}
