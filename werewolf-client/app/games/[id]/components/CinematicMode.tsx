'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, GameMessage, GAME_MASTER, GAME_ROLES, GAME_STATES, MessageType, PLAY_STYLE_CONFIGS } from '@/app/api/game-models';
import { getModelDisplayName } from '@/app/ai/ai-models';
import { getAvatarUrl } from '@/app/utils/avatar-utils';
import { convertMessageContent } from '@/app/utils/message-utils';
import PlayerAvatar from '@/app/components/PlayerAvatar';

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
}

export default function CinematicMode({ game, messages, onClose, startMessageId }: CinematicModeProps) {
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

    const [turnIndex, setTurnIndex] = useState(() => {
        if (!startMessageId) return 0;
        const i = turns.findIndex(t => t.key === startMessageId);
        return i >= 0 ? i : 0;
    });
    const [typedCount, setTypedCount] = useState(0);
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

    // Speaker identity + only the role knowledge the player legitimately has
    // (same gating as CharacterCard).
    const isGM = turn.speaker === GAME_MASTER;
    const isHuman = turn.speaker === game.humanPlayerName;
    const bot = game.bots.find(b => b.name === turn.speaker);
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    const isDead = bot ? !bot.isAlive : (isHuman && game.humanPlayerIsAlive === false);
    const role = isGM ? null : isHuman ? game.humanPlayerRole : bot?.role ?? null;
    const roleVisible = !isGM && !!role && (
        isHuman || isDead || isGameOver ||
        (game.humanPlayerRole === GAME_ROLES.WEREWOLF && role === GAME_ROLES.WEREWOLF)
    );
    const roleLabel = isGM ? 'GAME MASTER' : roleVisible ? role!.toUpperCase() : 'CREW';
    // Role tints per the design: crew neutral, werewolf red, GM green.
    const tint = isGM
        ? { line: 'oklch(60% 0.13 155 / 0.5)', glow: 'oklch(60% 0.13 155 / 0.3)', text: 'oklch(75% 0.13 155)' }
        : roleVisible && role === GAME_ROLES.WEREWOLF
            ? { line: 'oklch(60% 0.18 25 / 0.55)', glow: 'oklch(60% 0.18 25 / 0.35)', text: 'oklch(72% 0.16 25)' }
            : { line: 'var(--line-3)', glow: 'color-mix(in srgb, var(--line-3) 40%, transparent)', text: 'var(--fg-1)' };
    const avatarUrl = getAvatarUrl(game, turn.speaker);
    const modelName = isHuman ? 'Human' : getModelDisplayName(isGM ? game.gameMasterAiType : bot?.aiType ?? '');
    const playStyleName = bot ? (PLAY_STYLE_CONFIGS[bot.playStyle]?.name ?? bot.playStyle) : null;

    const typedHtml = tokens.slice(0, typedCount).join('');
    const nextLabel = !typingDone ? 'Skip' : atLastTurn ? (botsStillTalking ? 'Waiting…' : 'Close') : 'Next speaker';

    return (
        <div className="fixed inset-0 z-50 transition-opacity duration-300">
            {/* Scrim: blurs and dims the chat behind; click exits. */}
            <div
                className="absolute inset-0 backdrop-blur-[3px] backdrop-saturate-[.7] backdrop-brightness-[.55]"
                style={{background: 'radial-gradient(120% 100% at 50% 45%, #05060866 0%, #050608e0 100%)'}}
                onClick={onClose}
            />

            {/* Close — top-right corner */}
            <button
                onClick={onClose}
                aria-label="Exit cinematic mode"
                title="Close (Esc)"
                className="fixed top-4 right-4 z-30 w-[42px] h-[42px] flex items-center justify-center rounded-full border border-[var(--line-3)] text-white/90 hover:text-white hover:border-white/40 transition-colors"
                style={{background: '#12151bee', backdropFilter: 'blur(8px)'}}
            >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>

            {/* Stage */}
            <div className="absolute inset-0 grid place-items-center p-6 sm:p-[48px_56px] overflow-auto pointer-events-none">
                <div className="pointer-events-auto w-full grid items-center gap-[clamp(20px,3vw,40px)] grid-cols-1 max-w-[540px] min-[1101px]:max-w-[1320px] min-[1101px]:[grid-template-columns:clamp(240px,26vw,400px)_minmax(0,1fr)]">

                    {/* Portrait card — order 2 on small screens (bubble first) */}
                    <div className="order-2 min-[1101px]:order-1 justify-self-center min-[1101px]:justify-self-stretch w-[min(300px,58vw)] min-[1101px]:w-full">
                        <div
                            key={turn.key}
                            className="cine-card-swap relative w-full overflow-hidden rounded-[20px] border border-[var(--line-3)]"
                            style={{aspectRatio: '3 / 4.35', boxShadow: '0 40px 90px -20px #000c, 0 0 0 1px #ffffff0a inset', background: 'var(--bg-2)'}}
                        >
                            {avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route
                                <img src={avatarUrl} alt={turn.speaker} className={`absolute inset-0 w-full h-full object-cover object-top ${isDead ? 'grayscale brightness-[.6]' : ''}`} />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <PlayerAvatar name={turn.speaker} size={150} isGM={isGM} isDead={isDead} />
                                </div>
                            )}
                            {/* Role-tinted glow ring */}
                            <div aria-hidden className="absolute inset-0 rounded-[20px] pointer-events-none" style={{boxShadow: `0 0 0 1px ${tint.line} inset, 0 0 60px -10px ${tint.glow}`}} />
                            {/* Corner chips */}
                            <span className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.1em] px-[9px] py-[4px] rounded-[5px]" style={{background: '#0b0c0fcc', backdropFilter: 'blur(6px)', color: tint.text}}>{roleLabel}</span>
                            <span className="absolute top-3 right-3 font-mono text-[10px] tracking-[0.1em] px-[9px] py-[4px] rounded-[5px] text-[var(--fg-1)]" style={{background: '#0b0c0fcc', backdropFilter: 'blur(6px)'}}>{turnIndex + 1} / {turns.length}</span>
                            {/* Name plate */}
                            <div className="absolute inset-x-0 bottom-0 pointer-events-none px-[22px] pb-[20px] pt-[64px]" style={{background: 'linear-gradient(180deg, transparent, #080a0de6 45%, #080a0d)'}}>
                                <div className="text-white font-bold tracking-[-0.02em] text-[clamp(20px,2vw,30px)] leading-tight">{turn.speaker}{isDead ? ' ✝' : ''}</div>
                                <div className="mt-1.5 font-mono text-[11px] text-[var(--fg-2)] flex flex-col gap-0.5">
                                    <span>Model <span className="text-[var(--fg-1)]">{modelName}</span></span>
                                    {playStyleName && <span>Play style <span className="text-[var(--fg-1)]">{playStyleName}</span></span>}
                                    {turn.cost !== undefined && turn.cost > 0 && <span className="max-[1100px]:hidden">Cost <span className="text-[var(--fg-1)]">${turn.cost.toFixed(4)}</span></span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Speech bubble + controls */}
                    <div className="order-1 min-[1101px]:order-2 w-full">
                        <div
                            className="relative rounded-[20px] border border-[var(--line-2)]"
                            style={{background: 'color-mix(in srgb, #12151b 92%, transparent)', backdropFilter: 'blur(10px)', boxShadow: '0 30px 70px -30px #000d', padding: 'clamp(18px,2vw,26px) clamp(18px,2.2vw,30px)'}}
                        >
                            {/* Tail: points left at the card on desktop, down on small screens */}
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] hidden min-[1101px]:block min-[1101px]:left-[-9px] min-[1101px]:top-16 min-[1101px]:border-l min-[1101px]:border-b" style={{background: '#12151b'}} />
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] block min-[1101px]:hidden left-1/2 -ml-2 bottom-[-9px] border-r border-b" style={{background: '#12151b'}} />
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
                                    className="rounded-[11px] border border-[var(--line-2)] px-5 py-3 text-[13.5px] font-medium text-[var(--fg-1)] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--line-3)] transition-colors"
                                    style={{background: '#12151bcc', backdropFilter: 'blur(8px)'}}
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={next}
                                    disabled={atLastTurn && typingDone && botsStillTalking}
                                    className="rounded-[11px] border border-[var(--accent-line)] px-5 py-3 text-[13.5px] font-medium text-[var(--fg-0)] bg-[var(--accent-soft)] hover:brightness-110 disabled:opacity-60 transition-all inline-flex items-center gap-2"
                                    style={{backdropFilter: 'blur(8px)'}}
                                >
                                    {nextLabel}
                                    <span className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--line-2)] text-[var(--fg-2)]">SPACE</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Speaker rail */}
                    <div className="order-3 min-[1101px]:col-span-2 flex justify-center gap-2 flex-wrap max-h-[92px] overflow-hidden">
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
                                            ? 'opacity-100 border-[var(--accent)] -translate-y-[3px] shadow-[0_0_0_2px_var(--accent-soft)]'
                                            : state === 'done' ? 'opacity-[.65] border-transparent' : 'opacity-40 border-transparent'
                                    }`}
                                >
                                    {url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- authed dynamic route
                                        <img src={url} alt={t.speaker} className="w-full h-full object-cover object-top" />
                                    ) : (
                                        <PlayerAvatar name={t.speaker} size={38} isGM={t.speaker === GAME_MASTER} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
