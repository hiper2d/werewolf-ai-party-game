'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Game, GameMessage, GAME_MASTER, MessageType } from '@/app/api/game-models';
import { getAvatarView, getIllustrationUrl, getSceneUrl } from '@/app/utils/avatar-utils';
import { isPresetAvatarUrl } from '@/app/utils/preset-avatars';
import { focusToBackground } from '@/app/utils/avatar-framing';
import { getAvatarGradient } from '@/app/utils/color-utils';
import { convertMessageContent } from '@/app/utils/message-utils';
import { formatReplyForDisplay } from '@/app/utils/text-format';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import CharacterPoster from './CharacterPoster';

/**
 * Cinematic Speaker Mode — plays the day's discussion back one speaker at a
 * time: portrait card left, typewriter speech bubble right, Next/Prev/rail
 * navigation. Design: design_handoff_cinematic_mode.
 *
 * The turn list is derived from the live `messages` prop, so while the overlay
 * is open, newly arriving bot messages (SSE) extend the show — reaching the
 * end while bots are still thinking shows a waiting state instead of closing.
 * Advancing is always manual: Next / Space / a click on the empty stage or the
 * scrim — the bubble and the portrait themselves never advance, so you can click
 * into a line to re-read it. A line that arrives while the reader is parked never
 * steals the stage — it just re-enables Next.
 */

const AUTO_VOICE_KEY = 'cinematicAutoVoice';
const ILLUSTRATION_ALT = 'A scene from the story';

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
    image?: { url: string; alt: string }; // the picture this line carries in chat
}

/**
 * A GM illustration, shown above the line it belongs to. The image doc is
 * committed before its message exists, but it can still be gone (deleted
 * messages, an old game) — a 404 just hides the picture.
 */
function CineIllustration({ src, alt }: { src: string; alt: string }) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <div
            className={`mb-3 w-full max-w-[460px] overflow-hidden rounded-[14px] border border-[var(--line-2)] aspect-[3/2] ${loaded ? '' : 'animate-pulse bg-[var(--bg-3)]'}`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route */}
            <img
                src={src}
                alt={alt}
                className={`block w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </div>
    );
}

// Escape HTML, then re-introduce the two markdown-isms the bots actually use.
// Newlines survive as-is: the bubble is `whitespace-pre-wrap`, so a multi-line
// message (vote tallies, a bot's list) keeps its lines like it does in chat.
function toSpeechHtml(text: string): string {
    // Display-only cleanup (wrapping quotes, dash spacing): `turn.text` itself
    // stays raw for TTS.
    const escaped = formatReplyForDisplay(text)
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
    // `silent` suppresses the failure alert — an auto-played line that a browser's
    // autoplay policy blocks must not throw a dialog at someone who never clicked.
    onSpeak?: (messageId: string, text: string, opts?: { silent?: boolean }) => void;
    // Voices muted in the header: the pipeline ignores requests, so the scene
    // shows that rather than offering buttons that would do nothing.
    voiceMuted?: boolean;
    // The game is blocked on the player (their vote, their night action). The
    // scene says so and turns its primary button into the way out, because the
    // modal that asks for it opens behind this overlay.
    pendingHumanAction?: 'vote' | 'night' | null;
    speakingMessageId?: string | null;
    loadingMessageId?: string | null;
}

export default function CinematicMode({ game, messages, onClose, startMessageId, onSpeak, voiceMuted, pendingHumanAction, speakingMessageId, loadingMessageId }: CinematicModeProps) {
    // Every line carries the same picture it carries in chat: the day's opening
    // GM message its establishing shot, each "night falls" the night scene, and
    // a GM illustration the drawing it was posted with. An illustration is an
    // image-only message with no line of its own, so it rides on the GM turn it
    // belongs to — the last GM line before it, or, when the async image lands
    // above the day's opening story (chat normalizes that case by moving it
    // down), the first line after it. It replaces a stock scene on that turn:
    // the drawing of this game's own moment beats the reused establishing shot.
    const turns = useMemo<Turn[]>(() => {
        const welcomeUrl = getSceneUrl(game, 'welcome');
        const nightUrl = getSceneUrl(game, 'night');
        const isGmText = (m: GameMessage) => m.authorName === GAME_MASTER && m.messageType !== MessageType.GM_ILLUSTRATION;
        const firstGmIndex = messages.findIndex(isGmText);
        const built: Turn[] = [];
        let lastGmTurn = -1;              // index into `built`, an illustration's anchor
        let pendingIllustration: string | undefined;
        messages.forEach((m, i) => {
            if (m.messageType === MessageType.GM_ILLUSTRATION) {
                const sceneKey = (m.msg as { sceneKey?: string })?.sceneKey;
                if (!sceneKey) return;
                const url = getIllustrationUrl(game, sceneKey);
                const anchor = built[lastGmTurn] ?? built[built.length - 1];
                if (anchor) anchor.image = {url, alt: ILLUSTRATION_ALT};
                else pendingIllustration = url;
                return;
            }
            if (!SPEECH_TYPES.has(m.messageType as MessageType)) return;
            const text = convertMessageContent(m).trim();
            if (!text) return;
            const image = pendingIllustration
                ? {url: pendingIllustration, alt: ILLUSTRATION_ALT}
                : m.messageType === MessageType.NIGHT_BEGINS && nightUrl
                    ? {url: nightUrl, alt: 'The setting at night'}
                    : i === firstGmIndex && welcomeUrl
                        ? {url: welcomeUrl, alt: 'The setting of this game'}
                        : undefined;
            built.push({
                key: m.id ?? `t-${i}`,
                speaker: m.authorName,
                text,
                day: m.day,
                msgNo: m.id?.match(/^0*(\d+)/)?.[1] ?? String(built.length + 1),
                cost: m.cost,
                image,
            });
            pendingIllustration = undefined;
            if (isGmText(m)) lastGmTurn = built.length - 1;
        });
        // A scene, not an archive: only the 10 most recent lines play.
        return built.slice(-10);
    }, [messages, game]);

    // Auto-open lands on the line that just arrived; manual open starts at the
    // NEWEST line (the scene is "what's happening now" — Previous/rail go back).
    // The position is the line's KEY, not an index: the turn list is a sliding
    // last-10 window, so a live message shifts every index by one — anchoring
    // on the key keeps the reader on the same line when that happens.
    const [turnKey, setTurnKey] = useState<string | undefined>(() => {
        if (startMessageId && turns.some(t => t.key === startMessageId)) return startMessageId;
        return turns[turns.length - 1]?.key;
    });
    const [typedCount, setTypedCount] = useState(0);
    const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Auto-voice: read each line aloud as the scene reaches it. Off by default —
    // audio that starts on its own is intrusive, and a browser blocks autoplay
    // until the page has been interacted with. Remembered per browser.
    const [autoVoice, setAutoVoice] = useState(false);
    useEffect(() => {
        try {
            if (localStorage.getItem(AUTO_VOICE_KEY) === '1') setAutoVoice(true);
        } catch { /* ignore */ }
    }, []);
    const toggleAutoVoice = () => {
        const next = !autoVoice;
        setAutoVoice(next);
        try { localStorage.setItem(AUTO_VOICE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    };
    // Lines already read aloud by the switch, and whether the last move was
    // backwards. Together they make auto-voice strictly forward-going: stepping
    // back with Previous or the rail is for re-reading, so it stays quiet rather
    // than restarting the audio — and re-billing the TTS call — on every glance.
    const autoSpokenRef = useRef<Set<string>>(new Set());
    const wentBackRef = useRef(false);

    // A line that slid out of the window (10+ arrivals while parked) resolves
    // to the oldest line still shown.
    const turnIndex = Math.max(0, turns.findIndex(t => t.key === turnKey));
    const turn = turns[turnIndex];
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

    // Voice, fired on the same key change as the typewriter above: the request
    // goes out as the first words appear, so the audio is being generated while
    // the line types itself instead of after the reader asks for it. Playback
    // starts when the request returns — the manual button drives the identical
    // path, so it shows the same loading/pause state either way.
    useEffect(() => {
        if (!autoVoice || !onSpeak || !turn || voiceMuted) return;
        if (wentBackRef.current) { wentBackRef.current = false; return; }
        // The player's own lines are never auto-read: they have no assigned voice
        // (the lookup falls through to the default), so it costs a TTS call to
        // recite what the player just typed, in a voice they never picked. The
        // speaker button still works if they want to hear it.
        if (turn.speaker === game.humanPlayerName) return;
        if (autoSpokenRef.current.has(turn.key)) return;
        autoSpokenRef.current.add(turn.key);
        onSpeak(turn.key, turn.text, { silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn?.key, autoVoice, voiceMuted, game.humanPlayerName]);

    const goTo = useCallback((index: number) => {
        clearTimers();
        const target = Math.max(0, Math.min(index, turns.length - 1));
        if (target < turnIndex) wentBackRef.current = true;
        setTurnKey(turns[target]?.key);
    }, [clearTimers, turns, turnIndex]);

    const next = useCallback(() => {
        if (!typingDone) { setTypedCount(tokens.length); return; }
        if (!atLastTurn) { goTo(turnIndex + 1); return; }
        if (!botsStillTalking) onClose();
        // At the last turn with bots still talking: hold — the next SSE
        // message extends `turns`, which re-enables Next for the reader.
    }, [typingDone, tokens.length, atLastTurn, botsStillTalking, goTo, turnIndex, onClose]);

    const prev = useCallback(() => { if (turnIndex > 0) goTo(turnIndex - 1); }, [turnIndex, goTo]);

    // Click-to-advance: the scrim and the empty parts of the stage act as Next,
    // minus its end-of-scene close — a stray click must never dismiss the
    // overlay; that's what Close/Esc are for.
    //
    // The speech bubble and the portrait are marked `data-cine-hold` and never
    // advance: they are the things you actually look at, and clicking a line to
    // re-read a name should not skip past the speaker. They still finish the
    // typewriter, since revealing the rest of the line is the opposite of
    // leaving it.
    const advanceOnClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a')) return;
        if (!typingDone) { setTypedCount(tokens.length); return; }
        if (target.closest('[data-cine-hold]')) return;
        if (!atLastTurn) goTo(turnIndex + 1);
    }, [typingDone, tokens.length, atLastTurn, goTo, turnIndex]);

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
    // "The game needs you" outranks "bots are still talking": when both are true
    // the player is the one holding things up, and that is what must be said.
    // The notice shows wherever the reader is parked — being three lines back is
    // no reason to leave them unaware the table is waiting — while the primary
    // button only becomes the way out at the end, so Next keeps navigating.
    const needsYou = !!pendingHumanAction;
    const yourTurn = atLastTurn && typingDone && needsYou;
    const waiting = atLastTurn && typingDone && botsStillTalking && !yourTurn;
    // Scene over: the dedicated Close button becomes the primary action —
    // Next never doubles as a second, differently-styled "Close".
    const sceneOver = atLastTurn && typingDone && !botsStillTalking && !yourTurn;
    const yourTurnLabel = pendingHumanAction === 'night' ? 'Your night action' : 'Your vote';
    const nextLabel = !typingDone
        ? 'Skip'
        : yourTurn
            ? `Close and cast ${pendingHumanAction === 'night' ? 'your action' : 'your vote'}`
            : waiting ? 'Waiting…' : 'Next speaker';

    // Portal to <body>: rendered inside the chat column, the overlay lives in
    // that column's stacking context and the side panels (later DOM siblings)
    // paint OVER its edges — which buried the close button under the right panel.
    return createPortal(
        <div className="fixed inset-0 z-50 transition-opacity duration-300">
            {/* Scrim: blurs and dims the chat behind; click advances. The scrim
                gradient token carries the per-theme dimming, so no brightness
                filter (it muddies the light theme). */}
            <div
                className="absolute inset-0 backdrop-blur-[3px] backdrop-saturate-[.7]"
                style={{background: 'var(--cine-scrim)'}}
                onClick={advanceOnClick}
            />

            {/* Voice — press to read the current line; the switch beside it decides
                whether each new line reads itself as the scene moves forward. */}
            {onSpeak && (
                <div
                    className={`fixed top-4 right-[68px] z-30 h-[42px] flex items-center gap-2 rounded-full border pl-2.5 pr-3 transition-colors ${
                        autoVoice && !voiceMuted ? 'border-[var(--accent-line)]' : 'border-[var(--line-3)]'
                    }`}
                    style={{background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                >
                    <button
                        onClick={() => onSpeak(turn.key, turn.text)}
                        disabled={voiceMuted}
                        aria-label="Read this line aloud"
                        title={voiceMuted
                            ? 'Voices are muted — unmute in the chat header'
                            : speakingMessageId === turn.key ? 'Pause' : 'Read aloud'}
                        className={`w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            speakingMessageId === turn.key
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--fg-1)] hover:text-[var(--fg-0)]'
                        }`}
                    >
                        {loadingMessageId === turn.key ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                        ) : speakingMessageId === turn.key ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5,6 9,2 9,2 15,6 15,11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                        )}
                    </button>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoVoice}
                        aria-label="Read new lines aloud automatically"
                        onClick={toggleAutoVoice}
                        disabled={voiceMuted}
                        title={voiceMuted
                            ? 'Voices are muted — unmute in the chat header'
                            : autoVoice
                                ? 'Each new line reads itself aloud. Click to read only on demand.'
                                : 'Lines are read only when you press the speaker. Click to read each new line automatically.'}
                        className={`relative h-[15px] w-[27px] rounded-full border transition-colors duration-[160ms] flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                            autoVoice && !voiceMuted
                                ? 'bg-[var(--accent)] border-[var(--accent-line)]'
                                : 'bg-[var(--bg-4)] border-[var(--line-3)]'
                        }`}
                    >
                        <span
                            className={`absolute top-[2px] h-[9px] w-[9px] rounded-full transition-all duration-[160ms] ${
                                autoVoice
                                    ? 'left-[15px] bg-[var(--accent-fg)]'
                                    : 'left-[2px] bg-[var(--fg-2)]'
                            }`}
                        />
                    </button>
                </div>
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
                    onClick={advanceOnClick}
                >

                    {/* Portrait card — order 2 on small screens (bubble first) */}
                    <div data-cine-hold className="order-2 min-[1101px]:order-1 justify-self-center min-[1101px]:justify-self-stretch w-[min(300px,58vw)] min-[1101px]:w-full">
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
                            data-cine-hold
                            className="relative rounded-[20px] border border-[var(--line-2)]"
                            style={{background: 'var(--cine-panel)', backdropFilter: 'blur(10px)', boxShadow: 'var(--cine-panel-shadow)', padding: 'clamp(18px,2vw,26px) clamp(18px,2.2vw,30px)'}}
                        >
                            {/* Tail: points left at the card on desktop, down on small screens */}
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] hidden min-[1101px]:block min-[1101px]:left-[-9px] min-[1101px]:top-16 min-[1101px]:border-l min-[1101px]:border-b" style={{background: 'var(--cine-panel-solid)'}} />
                            <span aria-hidden className="absolute w-4 h-4 rotate-45 border-[var(--line-2)] block min-[1101px]:hidden left-1/2 -ml-2 bottom-[-9px] border-r border-b" style={{background: 'var(--cine-panel-solid)'}} />
                            {turn.image && (
                                <CineIllustration key={turn.image.url} src={turn.image.url} alt={turn.image.alt} />
                            )}
                            <div className="flex items-baseline justify-between gap-3 mb-2">
                                <span className="text-[15px] font-semibold text-[var(--fg-0)]">{turn.speaker}</span>
                                <span className="font-mono text-[10.5px] text-[var(--fg-3)] whitespace-nowrap">DAY {turn.day} · MESSAGE {turn.msgNo}</span>
                            </div>
                            <div className="cine-speech whitespace-pre-wrap text-[clamp(15px,1.15vw,18px)] leading-[1.65] text-[var(--fg-0)] min-h-[92px] sm:min-h-[132px]">
                                <span dangerouslySetInnerHTML={{__html: typedHtml}} />
                                {!typingDone && <span className="cine-caret" />}
                            </div>
                            {needsYou && (
                                <div
                                    role="status"
                                    className="mt-3 flex items-center gap-2.5 rounded-[12px] border border-[var(--accent-line)] px-3.5 py-2.5 text-[13.5px] text-[var(--fg-0)]"
                                    style={{background: 'var(--accent-soft)'}}
                                >
                                    <span className="w-[7px] h-[7px] rounded-full bg-[var(--accent)] flex-none animate-pulse" />
                                    <span>
                                        <strong>{yourTurnLabel}</strong> — the table is waiting on you. Close the scene to answer.
                                    </span>
                                </div>
                            )}
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
                                    onClick={yourTurn ? onClose : next}
                                    disabled={waiting || sceneOver}
                                    className={`rounded-[11px] border px-5 py-3 text-[13.5px] font-medium transition-all inline-flex items-center gap-2 ${
                                        yourTurn
                                            ? 'border-[var(--accent-line)] text-[var(--fg-0)] hover:brightness-110'
                                            : (waiting || sceneOver)
                                                ? 'border-[var(--line-2)] text-[var(--fg-2)] cursor-not-allowed opacity-70'
                                                : 'border-[var(--line-2)] text-[var(--fg-1)] hover:border-[var(--line-3)] hover:bg-[var(--cine-panel-hover)]'
                                    }`}
                                    style={yourTurn
                                        ? {background: 'var(--accent-soft)', backdropFilter: 'blur(8px)'}
                                        : {background: 'var(--cine-panel)', backdropFilter: 'blur(8px)'}}
                                >
                                    {nextLabel}
                                    {!waiting && !yourTurn && <span className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--line-2)] text-[var(--fg-2)]">SPACE</span>}
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
                            const view = getAvatarView(game, t.speaker);
                            const url = view?.url;
                            // A framed portrait shows its circle; the thumb is
                            // square-ish, so the circle's focus is what fits.
                            const thumbFocus = view?.focus ? focusToBackground(view.focus) : null;
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
                                    {url && thumbFocus ? (
                                        <div
                                            role="img"
                                            aria-label={t.speaker}
                                            className="w-full h-full"
                                            style={{
                                                backgroundImage: `url(${url})`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundSize: thumbFocus.backgroundSize,
                                                backgroundPosition: thumbFocus.backgroundPosition,
                                                ...(isPresetAvatarUrl(url) ? {mixBlendMode: 'multiply' as const} : {}),
                                            }}
                                        />
                                    ) : url ? (
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
