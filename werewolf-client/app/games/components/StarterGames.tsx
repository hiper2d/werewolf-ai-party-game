'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {useLoginDialog} from '@/app/providers/LoginDialogProvider';
import {GUEST_DEVICE_LIMIT_MESSAGE} from '@/app/utils/guest';
import {createStarterGame} from '@/app/api/starter-game-actions';
import {starterIntroKey, starterTableLine, type StarterCard} from '@/app/utils/starter-games';
import RoleCard from '@/app/games/[id]/components/RoleCard';
import {GAME_ROLES} from '@/app/api/game-models';
import {INPUT_LIMITS} from '@/app/utils/input-limits';
import {validatePlayerName} from '@/app/utils/name-utils';
import {DEFAULT_GAME_LANGUAGE, GAME_LANGUAGES} from '@/app/ai/game-language';

const LANGUAGE_STORAGE_KEY = 'starterLanguage';

/**
 * The start screen's cards: pick a ready-made story, type a name, play. One click creates
 * the game from its template (no setup form, no generation wait) and opens it.
 *
 * `guest` is the landing page's mode, for a visitor with no account (app/utils/guest.ts):
 * the same one click also makes them a guest, they get ONE game (no "Start over"), the
 * other stories ask for a sign-in, and so does their own game once it reaches day 2.
 */
export default function StarterGames({cards, defaultName, guest = false}: {cards: StarterCard[]; defaultName: string; guest?: boolean}) {
    const router = useRouter();
    const {update: refreshSession} = useSession();
    const {openLoginDialog} = useLoginDialog();
    const [name, setName] = useState(defaultName);
    const [startingId, setStartingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    // A NEW game takes a few seconds to deal. The player spends them on the card they
    // would read first anyway: their role (always a villager in a starter game) over the
    // story's picture. `gameId` arrives when the game exists; `begun` is the button pressed
    // before that, in which case the game opens the moment it is ready.
    const [intro, setIntro] = useState<{templateId: string; gameId?: string; begun?: boolean} | null>(null);

    // The languages the stories can be played in (a story without a translation is dealt
    // in its own language: the server decides). The picker shows only with a real choice.
    const offered = GAME_LANGUAGES.filter(l => cards.some(card => card.languages?.includes(l.code)));
    const offeredCodes = offered.map(l => l.code).join(',');
    const [language, setLanguage] = useState(DEFAULT_GAME_LANGUAGE);
    // After mount (the server cannot know): the last pick, else the browser's language.
    useEffect(() => {
        const codes = offeredCodes.split(',');
        let saved: string | null = null;
        try { saved = localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* private mode */ }
        const wanted = [saved, ...(navigator.languages ?? [navigator.language])]
            .map(code => (code ?? '').toLowerCase().split('-')[0])
            .find(code => codes.includes(code));
        if (wanted) setLanguage(wanted);
    }, [offeredCodes]);
    const chooseLanguage = (code: string) => {
        setLanguage(code);
        try { localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* private mode */ }
    };

    // Coming back with the browser's Back button restores this page from the router's
    // cache, which still says "Play" for a story the player has just started. Ask the server
    // again on every mount, so the card offers Continue.
    useEffect(() => {
        router.refresh();
        // A full page restored from the browser's back/forward cache does not remount.
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                setStartingId(null);
                setIntro(null);
                router.refresh();
            }
        };
        window.addEventListener('pageshow', onPageShow);
        return () => window.removeEventListener('pageshow', onPageShow);
    }, [router]);

    const nameError = validatePlayerName(name);

    // Play opens the player's unfinished game from this story when there is one (the server
    // decides, so a stale card behaves the same); `forceNew` deals a fresh one.
    const play = async (templateId: string, forceNew = false) => {
        if (startingId) return;
        // An existing game already has its name; only a new one needs a valid name here.
        const resuming = !forceNew && cards.some(card => card.id === templateId && card.resumeGameId);
        if (nameError && !resuming) {
            setError(nameError);
            return;
        }
        setError(null);
        setStartingId(templateId);
        if (!resuming) setIntro({templateId});
        try {
            const result = await createStarterGame(templateId, name, {forceNew, language});
            if (result.ok) {
                // A visitor became a guest inside that call: tell the session hooks (navbar,
                // device record) before the game page opens. Best effort.
                if (guest) await refreshSession().catch(() => null);
                if (resuming || result.existing) {
                    // An old game (also when a stale card said Play): no card, just open it.
                    setIntro(null);
                    router.push(`/games/${result.gameId}`);
                } else {
                    router.prefetch(`/games/${result.gameId}`);
                    setIntro(current => current ? {...current, gameId: result.gameId} : current);
                }
                return; // keep the buttons busy until the game page takes over
            }
            setIntro(null);
            setError(result.error);
            // A known device is asked to sign in, not offered another free game.
            if (result.error === GUEST_DEVICE_LIMIT_MESSAGE) openLoginDialog('/games');
        } catch {
            setIntro(null);
            setError('Could not start the game. Please try again.');
        }
        setStartingId(null);
    };

    // The role card's button. The game page is told the card has been read, so it opens
    // straight on the story (GamePage reads both keys). Storage failures only mean the
    // game shows its own card once more.
    const introGameId = intro?.gameId;
    const introBegun = intro?.begun === true;
    useEffect(() => {
        if (!introGameId || !introBegun) return;
        try {
            localStorage.setItem(`roleCardSeen:${introGameId}`, '1');
            sessionStorage.setItem(starterIntroKey(introGameId), '1');
        } catch { /* private mode */ }
        router.push(`/games/${introGameId}`);
    }, [introGameId, introBegun, router]);
    const introCard = intro ? cards.find(card => card.id === intro.templateId) : undefined;

    return (
        <div className="w-full">
            {!(guest && cards.some(card => card.resumeGameId)) && <div className="flex items-center gap-x-6 gap-y-3 mb-5 flex-wrap">
            <label className="flex items-center gap-3 flex-wrap">
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
            {offered.length > 1 && <label className="flex items-center gap-3">
                <span className="text-[13px] font-medium text-[var(--fg-1)]">Language</span>
                <select
                    value={language}
                    onChange={e => chooseLanguage(e.target.value)}
                    aria-label="The language the game is played in"
                    className="px-3 py-2 text-[14px] rounded-[var(--radius-md)] bg-[var(--bg-1)] text-[var(--fg-0)] border border-[var(--line-2)] focus:border-[var(--accent)] focus:outline-none transition-colors duration-[120ms]"
                >
                    {offered.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
                </select>
            </label>}
            </div>}

            {error && (
                <div role="alert" className="mb-4 px-4 py-3 text-[13px] text-[var(--fg-0)] border border-[oklch(62%_0.19_25_/_0.45)] bg-[oklch(62%_0.19_25_/_0.08)] rounded-[var(--radius-lg)]">
                    {error}
                </div>
            )}

            {intro && introCard && (
                <RoleCard
                    role={GAME_ROLES.VILLAGER}
                    own
                    locked
                    backdropSrc={`/api/starter-games/${introCard.id}/scene`}
                    note={<>{introCard.title}. {starterTableLine(introCard.playerCount, introCard.werewolfCount, introCard.specialRoles)}</>}
                    actionLabel={!intro.begun ? 'Begin' : intro.gameId ? 'Opening…' : 'Setting the table…'}
                    actionDisabled={intro.begun === true}
                    onClose={() => setIntro(current => current ? {...current, begun: true} : current)}
                />
            )}

            {startingId && !intro && (
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
                                    <span className="text-[11.5px] text-[var(--fg-2)]">{card.walled ? 'Day 2 is waiting for you' : card.resumeGameId ? 'Your game is in progress' : card.locked ? 'Free with an account' : <>{card.playerCount} players · you&apos;re a villager</>}</span>
                                    <div className="flex items-center gap-3">
                                        {card.resumeGameId && !guest && (
                                            <button
                                                type="button"
                                                onClick={() => play(card.id, true)}
                                                disabled={!!startingId}
                                                className="text-[12px] text-[var(--fg-2)] underline underline-offset-2 hover:text-[var(--fg-0)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-[120ms]"
                                            >
                                                Start over
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => card.locked
                                                ? openLoginDialog('/games')
                                                : card.walled ? openLoginDialog(`/games/${card.resumeGameId}`) : play(card.id)}
                                            disabled={!!startingId}
                                            className="px-4 py-2 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-[120ms]"
                                        >
                                            {starting ? 'Opening…' : card.locked ? 'Sign in to play' : card.walled ? 'Sign in to continue' : card.resumeGameId ? 'Continue' : 'Play'}
                                        </button>
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
