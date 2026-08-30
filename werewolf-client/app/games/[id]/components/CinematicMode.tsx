'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Game, GameMessage, GAME_MASTER, MessageType } from '@/app/api/game-models';
import { getAvatarUrl } from '@/app/utils/avatar-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import { getAvatarGradient } from '@/app/utils/color-utils';
import { convertMessageContent } from '@/app/utils/message-utils';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import CharacterPoster from './CharacterPoster';

/**
 * Cinematic Speaker Mode — plays the day's discussion back one speaker at a
 * time: portrait card left, typewriter speech bubble right, Next/Prev/rail
 * navigation, optional auto-advance. Design: design_handoff_cinematic_mode.
 *
 * The turn list is derived from the live `messages` prop, so while the overlay
 * is open, newly arriving bot messages (SSE) extend the show — reaching the
 * end while bots are still thinking shows a waiting state instead of closing.
 */

// Message types that read as "someone speaking" — everything with real prose.
export const SPEECH_TYPES = new Set<MessageType>([
    MessageType.BOT_ANSWER,
    MessageType.BOT_WELCOME,
    MessageType.HUMAN_PLAYER_MESSAGE,
    MessageType.VOTE_MESSAGE,
    MessageType.GAME_STORY,
    MessageType.NIGHT_SUMMARY,
    MessageType.GM_COMMAND,
    MessageType.NIGHT_BEGINS,
]);

interface Turn {
    key: string;
    speaker: string;
    text: string;      // plain text with markdown-ish *emphasis*
    day: number;
    msgNo: string;     // e.g. "41" from the message id counter, or ordinal
    cost?: number;
}

// Escape HTML, then re-introduce the two markdown-isms the bots actually use.
function toSpeechHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return escaped
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

// Tokens for the typewriter: whitespace-separated words, but complete HTML
// tags stay glued to their word so a tag is never emitted half-typed.
function tokenize(html: string): string[] {
    return html.split(/(\s+)/).filter(t => t.length > 0);
}

interface CinematicModeProps {
    game: Game;
    messages: GameMessage[]; // the rendered day's messages, in display order
    onClose: () => void;
    // Message id to open on (auto-open on a newly arrived line); default turn 0.
    startMessageId?: string;
    // Chat's TTS pipeline: play/pause the current line with the speaker's voice.
    onSpeak?: (messageId: string, text: string) => void;
    speakingMessageId?: string | null;
    loadingMessageId?: string | null;
}

export default function CinematicMode({ game, messages, onClose, startMessageId, onSpeak, speakingMessageId, loadingMessageId }: CinematicModeProps) {
    const turns = useMemo<Turn[]>(() =>
        messages
            .filter(m => SPEECH_TYPES.has(m.messageType as MessageType))
            .map((m, i) => {
                const text = convertMessageContent(m).trim();
                return {
                    key: m.id ?? `t-${i}`,
                    speaker: m.authorName,
                    text,
                    day: m.day,
                    msgNo: m.id?.match(/^0*(\d+)/)?.[1] ?? String(i + 1),
                    cost: m.cost,
                };
            })
            .filter(t => t.text.length > 0)
            // A scene, not an archive: only the 10 most recent lines play.
            .slice(-10),
        [messages]);

    // Auto-open lands on the line that just arrived; manual open starts at the
    // NEWEST line (the scene is "what's happening now" — Previous/rail go back).
    const [turnIndex, setTurnIndex] = useState(() => {
        if (startMessageId) {
            const i = turns.findIndex(t => t.key === startMessageId);
            if (i >= 0) return i;
        }
        return Math.max(0, turns.length - 1);
    });
    const [typedCount, setTypedCount] = useState(0);
    // Bot story on the portrait card: collapsed by default, and the choice
    // persists across turns — expand once and every speaker shows their story.
    const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevTurnCount = useRef(turns.length);

    const turn = turns[Math.min(turnIndex, turns.length - 1)];
    const tokens = useMemo(() => turn ? tokenize(toSpeechHtml(turn.text)) : [], [turn]);
    const typingDone = typedCount >= tokens.length;
    const botsStillTalking = game.gameStateProcessQueue.length > 0;
    const atLastTurn = turnIndex >= turns.length - 1;

    const clearTimers = useCallback(() => {
        if (typingTimer.current) { clearInterval(typingTimer.current); typingTimer.current = null; }
    }, []);

    // Typewriter: reveal 2 tokens per 42ms tick. Keyed on the line's identity,
    // not the index: the turn list is a sliding last-10 window, so when a new
    // live message pushes the window forward, the line under the same index
    // changes and must retype.
    useEffect(() => {
        clearTimers();
        setTypedCount(0);
        if (tokens.length === 0) return;
        typingTimer.current = setInterval(() => {
            setTypedCount(c => {
                if (c + 2 >= tokens.length) {
                    if (typingTimer.current) { clearInterval(typingTimer.current); typingTimer.current = null; }
                    return tokens.length;
                }
                return c + 2;
            });
        }, 42);
        return clearTimers;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn?.key]);

    const goTo = useCallback((index: number) => {
        clearTimers();
        setTurnIndex(Math.max(0, Math.min(index, turns.length - 1)));
    }, [clearTimers, turns.length]);

    const next = useCallback(() => {
        if (!typingDone) { setTypedCount(tokens.length); return; }
        if (!atLastTurn) { goTo(turnIndex + 1); return; }
        if (!botsStillTalking) onClose();
        // At the last turn with bots still talking: hold — the next SSE
        // message extends `turns` and the effect below advances.
    }, [typingDone, tokens.length, atLastTurn, botsStillTalking, goTo, turnIndex, onClose]);

    const prev = useCallback(() => { if (turnIndex > 0) goTo(turnIndex - 1); }, [turnIndex, goTo]);

    // Live feed: parked at the old last turn with typing finished → advance
    // into freshly arrived turns.
    useEffect(() => {
        if (turns.length > prevTurnCount.current && typingDone && turnIndex === prevTurnCount.current - 1) {
            setTurnIndex(prevTurnCount.current);
        }
        prevTurnCount.current = turns.length;
    }, [turns.length, typingDone, turnIndex]);

    // Keyboard, active only while open.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [next, prev, onClose]);

    if (!turn) return null;

    const typedHtml = tokens.slice(0, typedCount).join('');
    const waiting = atLastTurn && typingDone && botsStillTalking;
    // Scene over: the dedicated Close button becomes the primary action —
    // Next never doubles as a second, differently-styled "Close".
    const sceneOver = atLastTurn && typingDone && !botsStillTalking;
    const nextLabel = !typingDone ? 'Skip' : waiting ? 'Waiting…' : 'Next speaker';

    // Portal to <body>: rendered inside the chat column, the overlay lives in
    // that column's stacking context and the side panels (later DOM siblings)
    // paint OVER its edges — which buried the close button under the right panel.
    return createPortal(
        <div className="fixed inset-0 z-50 transition-opacity duration-300">
            {/* Scrim: blurs and dims the chat behind; click exits. The scrim
                gradient token carries the per-theme dimming, so no brightness
                filter (it muddies the light theme). */}
            <div
                className="absolute inset-0 backdrop-blur-[3px] backdrop-saturate-[.7]"
                style={{background: 'var(--cine-scrim)'}}
                onClick={onClose}
            />

            {/* Voice — plays the current line with the speaker's voice */}
            {onSpeak && (
                <button
                    onClick={() => onSpeak(turn.key, turn.text)}
                    aria-label="Read this line aloud"
                    title={speakingMessageId === turn.key ? 'Pause' : 'Read aloud'}
                    className={`fixed top-4 right-[68px] z-30 w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-colors ${
                        speakingMessageId === turn.key
                            ? 'border-[var(--accent-line)] text-[var(--accent)]'
                            : 'border-[var(--line-3)] text-[var(--fg-1)] hover:text-[var(--fg-0)]'
                    }`}
                    style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                >
                    {loadingMessageId === turn.key ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    ) : speakingMessageId === turn.key ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5,6 9,2 9,2 15,6 15,11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    )}
                </button>
            )}

            {/* Close — top-right corner */}
            <button
                onClick={onClose}
                aria-label="Exit cinematic mode"
                title="Close (Esc)"
                className="fixed top-4 right-4 z-30 w-[42px] h-[42px] flex items-center justify-center rounded-full border border-[var(--line-3)] text-[var(--fg-1)] hover:text-[var(--fg-0)] hover:border-[var(--line-3)] transition-colors"
                style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
            >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>

            {/* Stage */}
            <div className="absolute inset-0 grid place-items-center p-6 sm:p-[48px_56px] overflow-auto pointer-events-none">
                <div
                    className="pointer-events-auto w-full grid items-center gap-[clamp(20px,3vw,40px)] grid-cols-1 max-w-[540px] min-[1101px]:max-w-[1320px] min-[1101px]:[grid-template-columns:clamp(240px,26vw,400px)_minmax(0,1fr)]"
                    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
                >

                    {/* Portrait card — order 2 on small screens (bubble first) */}
                    <div className="order-2 min-[1101px]:order-1 justify-self-center min-[1101px]:justify-self-stretch w-[min(300px,58vw)] min-[1101px]:w-full">
                        <CharacterPoster
                            key={turn.key}
                            game={game}
                            name={turn.speaker}
                            cost={turn.cost}
                            hideCostOnNarrow
                            cornerChip={<span className="px-[9px] py-[4px]">{turnIndex + 1} / {turns.length}</span>}
                            className="cine-card-swap"
                        />
                    </div>

                    {/* Speech bubble + controls */}
                    <div className="order-1 min-[1101px]:order-2 w-full">
                        <div
                            className="relative rounded-[20px] border border-[var(--line-2)]"
                            style={{background: 'var(--cine-panel)', backdropFilter: 'blur(10px)', boxShadow: 'var(--cine-panel-shadow)', padding: 'clamp(18px,2vw,26px) clamp(18px,2.2vw,30px)'}}
                        >
                            {/* Tail: points left at the card on desktop, down on small screens */}
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] hidden min-[1101px]:block min-[1101px]:left-[-9px] min-[1101px]:top-16 min-[1101px]:border-l min-[1101px]:border-b" style={{background: 'var(--cine-panel-solid)'}} />
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] block min-[1101px]:hidden left-1/2 -ml-2 bottom-[-9px] border-r border-b" style={{background: 'var(--cine-panel-solid)'}} />
                            <div className="flex items-baseline justify-between gap-3 mb-2">
                                <span className="text-[15px] font-semibold text-[var(--fg-0)]">{turn.speaker}</span>
                                <span className="font-mono text-[10.5px] text-[var(--fg-3)] whitespace-nowrap">DAY {turn.day} · MESSAGE {turn.msgNo}</span>
                            </div>
                            <div className="cine-speech text-[clamp(15px,1.15vw,18px)] leading-[1.65] text-[var(--fg-0)] min-h-[92px] sm:min-h-[132px]">
                                <span dangerouslySetInnerHTML={{__html: typedHtml}} />
                                {!typingDone && <span className="cine-caret" />}
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5">
                                <button
                                    onClick={prev}
                                    disabled={turnIndex === 0}
                                    className="rounded-[11px] border border-[var(--line-2)] px-5 py-3 text-[13.5px] font-medium text-[var(--fg-1)] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--line-3)] hover:bg-[var(--cine-panel-hover)] transition-colors"
                                    style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={next}
                                    disabled={waiting || sceneOver}
                                    className={`rounded-[11px] border border-[var(--line-2)] px-5 py-3 text-[13.5px] font-medium transition-all inline-flex items-center gap-2 ${
                                        (waiting || sceneOver)
                                            ? 'text-[var(--fg-2)] cursor-not-allowed opacity-70'
                                            : 'text-[var(--fg-1)] hover:border-[var(--line-3)] hover:bg-[var(--cine-panel-hover)]'
                                    }`}
                                    style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                                >
                                    {nextLabel}
                                    {!waiting && <span className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--line-2)] text-[var(--fg-2)]">SPACE</span>}
                                    {waiting && (
                                        <span className="inline-flex gap-[3px]">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="w-[4px] h-[4px] rounded-full bg-[var(--accent)] animate-bounce" style={{animationDelay: `${i * 0.18}s`}} />
                                            ))}
                                        </span>
                                    )}
                                </button>
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-[11px] border border-[var(--line-2)] px-5 py-3 text-[13.5px] font-medium text-[var(--fg-1)] hover:border-[var(--line-3)] hover:bg-[var(--cine-panel-hover)] transition-colors inline-flex items-center gap-2"
                                style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                            >
                                Close
                                <span className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--line-2)] text-[var(--fg-2)]">ESC</span>
                            </button>
                        </div>
                    </div>

                    {/* Speaker rail */}
                    {/* pt-1 gives the active thumb's -3px lift headroom inside overflow-hidden */}
                    <div className="order-3 min-[1101px]:col-span-2 flex justify-center gap-2 flex-wrap max-h-[96px] overflow-hidden pt-1">
                        {turns.map((t, i) => {
                            const url = getAvatarUrl(game, t.speaker);
                            const state = i === turnIndex ? 'active' : i < turnIndex ? 'done' : 'todo';
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => goTo(i)}
                                    title={t.speaker}
                                    className={`w-[38px] h-[38px] rounded-[10px] overflow-hidden border transition-all flex-none ${
                                        state === 'active'
                                            ? 'opacity-100 border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-soft)]'
                                            : state === 'done' ? 'opacity-[.65] border-transparent' : 'opacity-40 border-transparent'
                                    }`}
                                    style={url && isPresetAvatarUrl(url)
                                        ? {background: `linear-gradient(135deg, ${getAvatarGradient(t.speaker)[0]} 0%, ${getAvatarGradient(t.speaker)[1]} 100%)`}
                                        : undefined}
                                >
                                    {url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route
                                        <img src={url} alt={t.speaker} className="w-full h-full object-cover object-top" style={isPresetAvatarUrl(url) ? {mixBlendMode: 'multiply'} : undefined} />
                                    ) : (
                                        <PlayerAvatar name={t.speaker} size={38} isGM={t.speaker === GAME_MASTER} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
