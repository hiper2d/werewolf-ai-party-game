'use client';

import React, { useState } from 'react';
import { BotPreview, PLAY_STYLE_CONFIGS, PLAY_STYLES } from '@/app/api/game-models';
import { getModelDisplayName } from '@/app/ai/ai-models';
import type { ImageFocus } from '@/app/utils/avatar-framing';
import ExpandableTextarea from '@/app/components/ExpandableTextarea';
import ModelSelectDropdown, { ModelOption } from '@/app/components/ModelSelectDropdown';
import SelectDropdown, { SelectOption } from '@/app/components/SelectDropdown';
import PlayerAvatar from '@/app/components/PlayerAvatar';
import { ChevronIcon, iconButton, InfoButton, InitialAvatar, labelStyle, monoMeta, nestedInputStyle, PlayIcon, playStyleLabel, storyBlurb } from './form-ui';

/** A drawn portrait to show in a row instead of the initial. */
export interface RowPortrait {
    url: string;
    focus?: ImageFocus;
}

interface CastListProps {
    bots: BotPreview[];
    humanName: string;
    // Portrait for a bot (by index) / the human, once a set is drawn for this cast.
    botPortrait: (index: number) => RowPortrait | undefined;
    humanPortrait?: RowPortrait;
    botNameErrors: { [index: number]: string };
    onPlayerChange: (index: number, field: string, value: string) => void;
    onBotAiChange: (index: number, model: string) => void;
    modelOptionsFor: (currentModel: string) => ModelOption[];
    voiceOptions: SelectOption[];
    isSpeaking: boolean;
    onPlay: (story: string, voice: string, voiceStyle?: string) => void;
    onStop: () => void;
}

const playStyleOptions: SelectOption[] = Object.values(PLAY_STYLES).map(style => ({ value: style, label: playStyleLabel(style) }));

/**
 * The preview's cast: one row per bot (portrait or initial, name, story
 * blurb, model, play style) that unfolds into the character's editor, and
 * the human player's row at the bottom.
 * @category Game
 */
export default function CastList({ bots, humanName, botPortrait, humanPortrait, botNameErrors, onPlayerChange, onBotAiChange, modelOptionsFor, voiceOptions, isSpeaking, onPlay, onStop }: CastListProps) {
    const [open, setOpen] = useState<number>(-1);

    return (
        <div>
            <div className="flex items-center gap-3 flex-wrap mb-2.5">
                <h3 className="m-0 text-[15px] font-semibold text-[var(--fg-0)]">Cast</h3>
                <span className={monoMeta}>{bots.length} bots + you</span>
                <span className="flex-1 h-px bg-[var(--line-1)] min-w-[20px]" />
                <span className="text-[12px] text-[var(--fg-3)]">Click a row to edit its story and voice</span>
            </div>
            <div className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] overflow-hidden">
                {bots.map((player, index) => {
                    const isOpen = open === index;
                    const portrait = botPortrait(index);
                    const nameError = botNameErrors[index];
                    return (
                        <div key={index} className="border-b border-[var(--line-1)]">
                            <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={isOpen}
                                onClick={() => setOpen(isOpen ? -1 : index)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? -1 : index); } }}
                                className="flex items-center gap-x-3 gap-y-2.5 flex-wrap px-3.5 py-[9px] cursor-pointer hover:bg-[var(--bg-2)] transition-colors duration-[120ms]"
                            >
                                <div className="flex items-center gap-2.5 flex-[1_1_200px] min-w-0">
                                    {portrait ? (
                                        <PlayerAvatar name={player.name} size={28} avatarUrl={portrait.url} focus={portrait.focus} className="shrink-0" />
                                    ) : (
                                        <InitialAvatar name={player.name || '?'} />
                                    )}
                                    <span className={`flex-none text-[14px] font-semibold tracking-[-0.01em] whitespace-nowrap ${nameError ? 'text-[var(--danger)]' : 'text-[var(--fg-0)]'}`}>{player.name || 'Unnamed'}</span>
                                    <span className="flex-[1_1_auto] min-w-0 text-[11px] text-[var(--fg-3)] truncate">{storyBlurb(player.story)}</span>
                                </div>
                                <span className="flex-[0_1_190px] min-w-0 text-[12px] text-[var(--fg-1)] truncate">{getModelDisplayName(player.playerAiType)}</span>
                                <span className="flex-[0_1_170px] min-w-0 text-[12px] text-[var(--fg-1)] truncate">{playStyleLabel(player.playStyle)}</span>
                                <span className="flex-none w-5 grid place-items-center text-[var(--fg-3)]"><ChevronIcon rotated={isOpen} /></span>
                            </div>

                            {isOpen && (
                                <div className="px-3.5 pt-1 pb-4 flex flex-col gap-3 bg-[var(--bg-2)]">
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                                        <div>
                                            <label className={labelStyle}>Name</label>
                                            <input
                                                type="text"
                                                className={`${nestedInputStyle} ${nameError ? '!border-[var(--danger)]' : ''}`}
                                                value={player.name}
                                                onChange={e => onPlayerChange(index, 'name', e.target.value)}
                                                placeholder="Player name"
                                                aria-label="Player name"
                                            />
                                            {nameError && <p className="text-[var(--danger)] text-[11px] mt-1">{nameError}</p>}
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Model</label>
                                            <ModelSelectDropdown
                                                options={modelOptionsFor(player.playerAiType)}
                                                value={player.playerAiType}
                                                onChange={value => onBotAiChange(index, value)}
                                                className="w-full"
                                            />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <label className="text-[12px] font-medium text-[var(--fg-1)]">Play style</label>
                                                <InfoButton label="Play style info" size={16} align="right">
                                                    <span className="block font-semibold text-[var(--fg-0)] mb-1">{PLAY_STYLE_CONFIGS[player.playStyle]?.name || playStyleLabel(player.playStyle)}</span>
                                                    {PLAY_STYLE_CONFIGS[player.playStyle]?.uiDescription || 'How this bot behaves in day discussions and votes.'}
                                                </InfoButton>
                                            </div>
                                            <SelectDropdown
                                                options={playStyleOptions}
                                                value={player.playStyle}
                                                onChange={val => onPlayerChange(index, 'playStyle', val)}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                                        <div>
                                            <label className={labelStyle}>Story</label>
                                            <ExpandableTextarea
                                                className={nestedInputStyle}
                                                minHeight={92}
                                                value={player.story}
                                                onChange={e => onPlayerChange(index, 'story', e.target.value)}
                                                placeholder="Player's story"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Appearance</label>
                                            <ExpandableTextarea
                                                className={nestedInputStyle}
                                                minHeight={92}
                                                value={player.visualDescription ?? ''}
                                                onChange={e => onPlayerChange(index, 'visualDescription', e.target.value)}
                                                placeholder="Face, hair, build, clothing — used to draw the portrait"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-2.5 flex-wrap">
                                        <div className="flex-[1_1_150px] max-w-[190px]">
                                            <label className={labelStyle}>Voice</label>
                                            <SelectDropdown
                                                options={voiceOptions}
                                                value={player.voice}
                                                onChange={val => onPlayerChange(index, 'voice', val)}
                                            />
                                        </div>
                                        {player.voiceStyle !== undefined && (
                                            <div className="flex-[1_1_150px] max-w-[190px]">
                                                <label className={labelStyle}>Voice style</label>
                                                <input
                                                    type="text"
                                                    className={nestedInputStyle}
                                                    value={player.voiceStyle}
                                                    onChange={e => onPlayerChange(index, 'voiceStyle', e.target.value)}
                                                    placeholder="e.g., mysteriously, excitedly"
                                                />
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            className={`${iconButton} flex-none bg-[var(--bg-1)]`}
                                            onClick={() => isSpeaking ? onStop() : onPlay(player.story, player.voice, player.voiceStyle)}
                                            disabled={!player.story}
                                            title={isSpeaking ? 'Stop speaking' : 'Play story'}
                                            aria-label={isSpeaking ? 'Stop speaking' : 'Play story'}
                                        >
                                            <PlayIcon playing={isSpeaking} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* The human player */}
                <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-2.5">
                    {humanPortrait ? (
                        <PlayerAvatar name={humanName} size={28} avatarUrl={humanPortrait.url} focus={humanPortrait.focus} className="shrink-0" />
                    ) : (
                        <InitialAvatar name={humanName || '?'} />
                    )}
                    <span className="text-[14px] font-semibold text-[var(--you-fg)]">{humanName}</span>
                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--fg-3)]">YOU · ROLE HIDDEN UNTIL THE GAME STARTS</span>
                </div>
            </div>
        </div>
    );
}
