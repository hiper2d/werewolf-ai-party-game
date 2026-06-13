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
        <div className="flex flex-col h-full overflow-hidden max-w-[1040px] mx-auto w-full">
            <div className="flex justify-between items-center mb-6 pt-4">
                <h1 className="text-[20px] font-semibold text-[var(--fg-0)] tracking-[-0.01em]">Game List</h1>
                <Link
                    href="/games/newgame"
                    className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 transition-all duration-[120ms]"
                >
                    Create Game
                </Link>
            </div>

            {errorCode === 'tier_mismatch' && (
                <div className="mb-4 p-4 border border-[oklch(75%_0.10_65_/_0.4)] bg-[oklch(75%_0.10_65_/_0.08)] rounded-[var(--radius-lg)] flex items-start justify-between gap-4">
                    <div className="text-[13px] text-[var(--fg-0)]">
                        You can only open games created on your current tier. {blockedGameId ? `Game ${blockedGameId} is locked.` : ''}
                    </div>
                    <Link
                        href="/games"
                        className="text-[var(--fg-1)] hover:text-[var(--fg-0)] text-[12px] font-medium transition-colors"
                        aria-label="Dismiss tier warning"
                    >
                        Dismiss
                    </Link>
                </div>
            )}

            {games.length === 0 ? (
                <div className="flex-grow flex items-start justify-center pt-[16vh]">
                    <div className="text-center max-w-[420px] mx-auto px-6">
                        <div className="mx-auto w-14 h-14 rounded-full grid place-items-center border border-[var(--line-2)] bg-[var(--bg-2)] shadow-[var(--shadow-1)] mb-5">
                            <svg className="w-6 h-6 text-[var(--fg-1)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                            </svg>
                        </div>
                        <h2 className="text-[18px] font-semibold text-[var(--fg-0)] mb-2">No games yet</h2>
                        <p className="text-[13.5px] text-[var(--fg-2)] leading-[1.55] mb-6">
                            Start your first match — pick a theme, choose your models, and drop into a table full of AI players
                            who think they&apos;re human. Can you spot the werewolves before they get you?
                        </p>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            <Link
                                href="/games/newgame"
                                className="px-5 py-2.5 text-[14px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-1)] hover:brightness-110 transition-all duration-[120ms]"
                            >
                                Create your first game
                            </Link>
                            <Link
                                href="/rules"
                                className="px-5 py-2.5 text-[14px] font-medium rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)] transition-all duration-[120ms]"
                            >
                                Read the rules
                            </Link>
                        </div>
                    </div>
                </div>
            ) : (
            <div className="flex-grow overflow-auto">
                <ul className="space-y-3">
                    {games.map((game) => {
                        const isSameTier = game.createdWithTier === userTier;
                        return (
                        <li
                            key={game.id}
                            className={`bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] px-4 py-4 shadow-subtle transition-all duration-[120ms] ${
                                isSameTier ? 'hover:border-[var(--line-3)]' : 'opacity-50'
                            }`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                {isSameTier ? (
                                    <Link href={`/games/${game.id}`} className="flex-grow">
                                        <GameListEntryContent game={game} />
                                    </Link>
                                ) : (
                                    <div className="flex-grow cursor-not-allowed">
                                        <GameListEntryContent game={game} locked />
                                        <p className="mt-2 text-[11px] text-[var(--fg-2)]">
                                            Switch to the <span className="font-medium uppercase">{game.createdWithTier}</span> tier to continue this game.
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
            )}
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
                <h2 className="text-[16px] capitalize text-[var(--fg-0)] font-semibold truncate">
                    {game.theme}
                    {game.humanPlayerName && (
                        <span className="text-[13px] font-normal text-[var(--fg-2)] ml-2">as {game.humanPlayerName}</span>
                    )}
                </h2>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-[var(--fg-2)]">
                    <span>{formatCreationDate(game.createdAt)}</span>
                    <span className="hidden sm:inline text-[var(--line-3)]">&middot;</span>
                    <span className="font-medium text-[var(--fg-1)] uppercase tracking-[0.04em]">
                        Day {game.currentDay} &middot; {stateLabel}
                    </span>
                </div>
            </div>

            {/* Description row */}
            <p className="text-[13px] text-[var(--fg-1)] line-clamp-2 leading-relaxed">{game.description}</p>

            {/* Bottom row: Tier */}
            <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-[var(--fg-3)]">
                {game.createdWithTier} tier
            </div>
        </div>
    );
}
