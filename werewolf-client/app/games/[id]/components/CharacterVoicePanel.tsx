'use client';

import React, { useMemo, useState } from 'react';
import { GAME_MASTER, Game } from '@/app/api/game-models';
import { getDefaultVoiceProvider, getVoiceConfig, VOICE_PROVIDER_DISPLAY_NAMES, VoiceProvider } from '@/app/ai/voice-config';
import SelectDropdown from '@/app/components/SelectDropdown';

// A voice within the game's voice set (the set itself is fixed at preview time).
export interface VoiceSelection {
    voice: string;
    voiceStyle: string;
}

interface CharacterVoicePanelProps {
    game: Game;
    name: string; // a bot or GAME_MASTER
    // Owner only: persists the selection. Absent = read-only summary line.
    onSave?: (selection: VoiceSelection) => Promise<void>;
    // Auditions the UNSAVED selection with a sample line; resolves when playback starts.
    onSpeakSample?: (text: string, selection: VoiceSelection) => Promise<void>;
    onStopSample?: () => void;
}

const GM_SAMPLE = 'Night falls over the village. Everyone, close your eyes.';
const BOT_SAMPLE_FALLBACK = 'I have nothing to hide. Can the rest of you say the same?';

/** First sentence or so of the character's story, so the audition sounds like them. */
function sampleLineFor(game: Game, name: string): string {
    if (name === GAME_MASTER) return GM_SAMPLE;
    const story = game.bots.find(b => b.name === name)?.story?.trim();
    if (!story) return BOT_SAMPLE_FALLBACK;
    const firstSentence = /^[^.!?]*[.!?]/.exec(story)?.[0] ?? story;
    return firstSentence.length > 160 ? `${firstSentence.slice(0, 157).trimEnd()}…` : firstSentence;
}

function currentSelection(game: Game, name: string): VoiceSelection {
    const bot = game.bots.find(b => b.name === name);
    return {
        voice: name === GAME_MASTER ? game.gameMasterVoice : bot?.voice ?? '',
        voiceStyle: (name === GAME_MASTER ? game.gameMasterVoiceStyle : bot?.voiceStyle) ?? '',
    };
}

/**
 * The voice block under a character's card: the character's voice (from the
 * game's voice set) and style direction. Collapsed to one summary line; the
 * owner unfolds it to edit and audition before saving.
 * @category Game
 */
export default function CharacterVoicePanel({ game, name, onSave, onSpeakSample, onStopSample }: CharacterVoicePanelProps) {
    const saved = useMemo(() => currentSelection(game, name), [game, name]);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<VoiceSelection>(saved);
    const [busy, setBusy] = useState<'save' | 'play' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const gender: 'male' | 'female' = game.bots.find(b => b.name === name)?.gender ?? 'male';
    const voiceProvider: VoiceProvider = game.voiceProvider || getDefaultVoiceProvider();

    const voices = useMemo(() => {
        // Matching-gender voices first; the rest stay reachable for deliberate picks.
        const all = getVoiceConfig(voiceProvider).getVoices();
        return [...all.filter(v => v.gender === gender), ...all.filter(v => v.gender !== gender)]
            .map(v => ({ value: v.id, label: v.id, secondaryLabel: v.gender }));
    }, [voiceProvider, gender]);

    const dirty = draft.voice !== saved.voice || draft.voiceStyle.trim() !== saved.voiceStyle.trim();

    const open = () => { setDraft(saved); setError(null); setEditing(true); };
    const cancel = () => { onStopSample?.(); setDraft(saved); setError(null); setEditing(false); };

    const play = async () => {
        if (!onSpeakSample) return;
        setBusy('play');
        setError(null);
        try {
            await onSpeakSample(sampleLineFor(game, name), { ...draft, voiceStyle: draft.voiceStyle.trim() });
        } catch (err: any) {
            setError(err?.message ?? 'Could not play the sample.');
        } finally {
            setBusy(null);
        }
    };

    const save = async () => {
        if (!onSave) return;
        setBusy('save');
        setError(null);
        try {
            await onSave({ ...draft, voiceStyle: draft.voiceStyle.trim() });
            setEditing(false);
        } catch (err: any) {
            setError(err?.message ?? 'Could not save the voice.');
        } finally {
            setBusy(null);
        }
    };

    const panelStyle = { background: 'var(--cine-panel)', backdropFilter: 'blur(8px)' } as const;
    const label = 'font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--fg-3)]';

    if (!editing) {
        return (
            <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[var(--line-3)] px-3 py-2 text-[12px]" style={panelStyle}>
                <span className={label}>Voice</span>
                <span className="min-w-0 truncate text-[var(--fg-0)]">
                    {saved.voice || '—'}
                    {saved.voiceStyle && <span className="text-[var(--fg-2)]"> · {saved.voiceStyle}</span>}
                </span>
                <span className="ml-auto font-mono text-[10px] uppercase text-[var(--fg-3)] whitespace-nowrap">{VOICE_PROVIDER_DISPLAY_NAMES[voiceProvider]}</span>
                {onSave && (
                    <button
                        type="button"
                        onClick={open}
                        className="flex-none text-[12px] font-medium px-2 py-1 rounded-[6px] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                    >
                        Edit
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="mt-3 flex flex-col gap-2.5 rounded-[12px] border border-[var(--line-3)] p-3" style={panelStyle}>
            <div>
                <div className={`${label} mb-1 flex items-center gap-2`}>
                    <span>Voice</span>
                    <span className="ml-auto normal-case tracking-normal text-[var(--fg-3)]">{VOICE_PROVIDER_DISPLAY_NAMES[voiceProvider]} set</span>
                </div>
                <SelectDropdown options={voices} value={draft.voice} onChange={voice => setDraft(d => ({ ...d, voice }))} />
            </div>
            <div>
                <div className={`${label} mb-1`}>Style</div>
                <input
                    type="text"
                    value={draft.voiceStyle}
                    onChange={e => setDraft(d => ({ ...d, voiceStyle: e.target.value }))}
                    placeholder="mysteriously · or a longer direction: slow, gravelly, like an old sailor"
                    maxLength={300}
                    className="w-full px-2.5 py-1.5 text-[13px] rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--line-2)] text-[var(--fg-0)] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)]"
                />
            </div>
            {error && <div className="text-[12px] text-[var(--danger)]">{error}</div>}
            <div className="flex items-center gap-2 pt-0.5">
                {onSpeakSample && (
                    <button
                        type="button"
                        onClick={play}
                        disabled={busy !== null || !draft.voice}
                        className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--line-3)] bg-[var(--bg-2)] text-[var(--fg-1)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-3)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Play a sample line with these settings"
                    >
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1.5v9l8-4.5z"/></svg>
                        {busy === 'play' ? 'Loading…' : 'Sample'}
                    </button>
                )}
                <span className="flex-1" />
                <button type="button" onClick={cancel} disabled={busy === 'save'} className="text-[12px] font-medium px-2.5 py-1.5 rounded-[var(--radius-md)] text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors">
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || busy !== null || !draft.voice}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
}
