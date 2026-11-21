'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {createStarterGame} from '@/app/api/starter-game-actions';
import type {StarterCard} from '@/app/utils/starter-games';
import {INPUT_LIMITS} from '@/app/utils/input-limits';
import {validatePlayerName} from '@/app/utils/name-utils';

/**
 * The start screen's cards: pick a ready-made story, type a name, play. One click creates
 * the game from its template (no setup form, no generation wait) and opens it.
 */
export default function StarterGames({cards, defaultName}: {cards: StarterCard[]; defaultName: string}) {
    const router = useRouter();
    const [name, setName] = useState(defaultName);
    const [startingId, setStartingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Coming back with the browser's Back button restores this page from the router's
    // cache, which still says "Play" for a story the player has just started. Ask the server
    // again on every mount, so the card offers Continue.
    useEffect(() => {
        router.refresh();
    }, [router]);

    const nameError = validatePlayerName(name);

    const play = async (templateId: string) => {
        if (startingId) return;
        if (nameError) {
            setError(nameError);
            return;
        }
        setError(null);
        setStartingId(templateId);
        try {
            const result = await createStarterGame(templateId, name);
            if (result.ok) {
                router.push(`/games/${result.gameId}`);
                return; // keep the button busy until the game page takes over
            }
            setError(result.error);
        } catch {
            setError('Could not start the game. Please try again.');
        }
        setStartingId(null);
    };

    return (
        <div className="w-full">
            <label className="flex items-center gap-3 mb-5 flex-wrap">
                <span className="text-[13px] font-medium text-[var(--fg-1)]">Your name</span>
                <input
                    value={name}
                    onChange={e => { setName(e.target.value); setError(null); }}
                    maxLength={INPUT_LIMITS.playerName}
                    placeholder="One word"
                    aria-label="Your name in the game"
                    className="w-[200px] px-3 py-2 text-[14px] rounded-[var(--radius-md)] bg-[var(--bg-1)] text-[var(--fg-0)] border border-[var(--line-2)] focus:border-[var(--accent)] focus:outline-none transition-colors duration-[120ms]"
                />
                <span className="text-[12px] text-[var(--fg-2)]">Letters and numbers, no spaces.</span>
            </label>

            {error && (
                <div role="alert" className="mb-4 px-4 py-3 text-[13px] text-[var(--fg-0)] border border-[oklch(62%_0.19_25_/_0.45)] bg-[oklch(62%_0.19_25_/_0.08)] rounded-[var(--radius-lg)]">
                    {error}
                </div>
            )}

            {startingId && (
                <div role="status" className="mb-4 px-4 py-3 text-[13px] text-[var(--fg-1)] border border-[var(--line-2)] bg-[var(--bg-1)] rounded-[var(--radius-lg)]">
                    Setting the table… your game opens in a moment.
                </div>
            )}

            <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => {
                    const starting = startingId === card.id;
                    return (
                        <li key={card.id} className="flex flex-col overflow-hidden bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] shadow-subtle hover:border-[var(--line-3)] transition-all duration-[120ms]">
                            <div className="aspect-[16/9] bg-[var(--bg-2)] overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/starter-games/${card.id}/scene`} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                            <div className="flex flex-col gap-2 p-4 flex-grow">
                                <h3 className="m-0 text-[16px] font-semibold text-[var(--fg-0)] tracking-[-0.01em]">
                                    {card.title}
                                    {card.draft && <span className="ml-2 align-middle text-[10.5px] font-medium uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[var(--line-2)] text-[var(--fg-2)]">Draft · local only</span>}
                                </h3>
                                <p className="m-0 text-[13px] leading-[1.55] text-[var(--fg-2)] flex-grow">{card.hook}</p>
                                <div className="flex items-center justify-between gap-3 pt-2">
                                    <span className="text-[11.5px] text-[var(--fg-2)]">{card.resumeGameId ? 'Your game is in progress' : <>{card.playerCount} players · you&apos;re a villager</>}</span>
                                    <div className="flex items-center gap-2">
                                        {card.resumeGameId && (
                                            <button
                                                type="button"
                                                onClick={() => play(card.id)}
                                                disabled={!!startingId}
                                                className="px-3 py-2 text-[12.5px] font-medium rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-[120ms]"
                                            >
                                                {starting ? 'Starting…' : 'New game'}
                                            </button>
                                        )}
                                        {card.resumeGameId ? (
                                            <button
                                                type="button"
                                                onClick={() => router.push(`/games/${card.resumeGameId}`)}
                                                disabled={!!startingId}
                                                className="px-4 py-2 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-[120ms]"
                                            >
                                                Continue
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => play(card.id)}
                                                disabled={!!startingId}
                                                className="px-4 py-2 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-[120ms]"
                                            >
                                                {starting ? 'Starting…' : 'Play'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
