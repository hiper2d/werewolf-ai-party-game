'use client';

import React, { useState } from 'react';
import { ROLE_CONFIGS, Game, GAME_ROLES } from '@/app/api/game-models';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';
import { getColor } from '@/utils/ember-colors';

const ROLE_ACCENTS: Record<string, string> = {
    [GAME_ROLES.WEREWOLF]:  'var(--ember-blood-3)',
    [GAME_ROLES.DOCTOR]:    'var(--ember-team-village)',
    [GAME_ROLES.DETECTIVE]: 'var(--ember-moon-2)',
    [GAME_ROLES.MANIAC]:    'var(--ember-fire-3)',
};

const ROLE_DESCS: Record<string, string> = {
    [GAME_ROLES.WEREWOLF]:  'The pack hunts tonight. Who will not see the dawn?',
    [GAME_ROLES.DOCTOR]:    'Your healing wards off one death tonight. Choose wisely.',
    [GAME_ROLES.DETECTIVE]: 'Peer beneath the mask. Is this soul Good or Bad?',
    [GAME_ROLES.MANIAC]:    'Drag one soul into the night. All actions against them fail.',
};

interface NightActionModalProps {
    onClose: () => void;
    onAction: (targetPlayer: string, message: string, actionType?: 'protect' | 'kill') => void;
    game: Game;
    currentRole: string;
    isLastInQueue: boolean;
    isSubmitting?: boolean;
}

export default function NightActionModal({
    onClose,
    onAction,
    game,
    currentRole,
    isLastInQueue,
    isSubmitting = false
}: NightActionModalProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('nightAction');
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [message, setMessage] = useState<string>('');
    const [actionType, setActionType] = useState<'protect' | 'kill' | 'investigate'>(() => {
        if (currentRole === GAME_ROLES.DETECTIVE) return 'investigate';
        return 'protect';
    });

    if (!isOpen) return null;

    const accent = ROLE_ACCENTS[currentRole] || 'var(--ember-fire-3)';
    const flavorText = ROLE_DESCS[currentRole] || '';

    const isDoctorWithKillAbility = currentRole === GAME_ROLES.DOCTOR &&
        !game.oneTimeAbilitiesUsed?.doctorKill;
    const isDetectiveWithKillAbility = currentRole === GAME_ROLES.DETECTIVE &&
        !game.oneTimeAbilitiesUsed?.detectiveKill;

    const roleConfig = ROLE_CONFIGS[currentRole];
    if (!roleConfig) return null;

    const getAvailableTargets = () => {
        const allPlayers = [
            { name: game.humanPlayerName, isAlive: true, isHuman: true },
            ...game.bots.map(bot => ({
                name: bot.name,
                isAlive: bot.isAlive,
                isHuman: false
            }))
        ];
        const previousTarget = game.previousNightResults?.[currentRole]?.target;

        switch (currentRole) {
            case GAME_ROLES.WEREWOLF:
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
            case GAME_ROLES.DOCTOR:
                return allPlayers.filter(p => p.isAlive && p.name !== previousTarget);
            case GAME_ROLES.DETECTIVE:
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
            case GAME_ROLES.MANIAC:
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName && p.name !== previousTarget);
            default:
                return [];
        }
    };

    const availableTargets = getAvailableTargets();

    const handleSubmit = async () => {
        if (!selectedPlayer) return;
        const finalMessage = message.trim() || '';
        if (currentRole === GAME_ROLES.DOCTOR && isDoctorWithKillAbility) {
            await onAction(selectedPlayer, finalMessage, actionType as 'protect' | 'kill');
        } else if (currentRole === GAME_ROLES.DETECTIVE && actionType === 'kill') {
            await onAction(selectedPlayer, finalMessage, 'kill');
        } else {
            await onAction(selectedPlayer, finalMessage);
        }
    };

    const handleClose = () => {
        setSelectedPlayer('');
        setMessage('');
        setActionType(currentRole === GAME_ROLES.DETECTIVE ? 'investigate' : 'protect');
        onClose();
    };

    return (
        <DraggableDialog
            isOpen={isOpen}
            title={roleConfig.actionTitle || 'Night Action'}
            className="w-[540px]"
            accent={accent}
            onClose={handleClose}
        >
            {/* Flavor text */}
            <p style={{ color: 'var(--ember-ink-1)', margin: '0 0 14px 0', fontSize: 14 }}>
                {flavorText}
            </p>

            {/* Target grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 6,
                marginBottom: 14,
            }}>
                {availableTargets.map((p, i) => {
                    const colorIdx = (i + 1) % 16;
                    const color = getColor(colorIdx);
                    const isSelected = selectedPlayer === p.name;

                    return (
                        <button
                            key={p.name}
                            data-c={colorIdx}
                            onClick={() => setSelectedPlayer(p.name)}
                            disabled={isSubmitting}
                            style={{
                                padding: '10px 12px',
                                background: isSelected ? color : 'var(--ember-bg-3)',
                                border: `2px solid ${isSelected ? 'var(--ember-ink-0)' : 'var(--ember-border)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                color: isSelected ? '#0a0a14' : 'var(--ember-ink-1)',
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                textAlign: 'left' as const,
                            }}
                        >
                            <div style={{
                                width: 18, height: 18,
                                background: color,
                                border: '2px solid var(--ember-bg-0)',
                                flexShrink: 0,
                            }} />
                            <div className="pixel-text" style={{ fontSize: 9, flex: 1 }}>
                                {p.name.split(' ')[0]}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Doctor's action type toggle */}
            {isDoctorWithKillAbility && (
                <div style={{
                    marginBottom: 14,
                    padding: 12,
                    background: 'var(--ember-bg-0)',
                    border: '2px solid var(--ember-border)',
                }}>
                    <div className="pixel-text" style={{
                        fontSize: 9, color: 'var(--ember-ink-2)',
                        marginBottom: 8, letterSpacing: 1,
                    }}>
                        CHOOSE YOUR ACTION
                    </div>
                    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--ember-border)' }}>
                        <button
                            onClick={() => setActionType('protect')}
                            disabled={isSubmitting}
                            className="pixel-text"
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: 8,
                                background: actionType === 'protect' ? 'var(--ember-team-village)' : 'var(--ember-bg-2)',
                                color: actionType === 'protect' ? '#0a0a14' : 'var(--ember-ink-2)',
                                borderRight: '1px solid var(--ember-border)',
                                cursor: 'pointer',
                            }}
                        >
                            PROTECT
                        </button>
                        <button
                            onClick={() => setActionType('kill')}
                            disabled={isSubmitting}
                            className="pixel-text"
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: 8,
                                background: actionType === 'kill' ? 'var(--ember-blood-3)' : 'var(--ember-bg-2)',
                                color: actionType === 'kill' ? '#fff' : 'var(--ember-ink-2)',
                                cursor: 'pointer',
                            }}
                        >
                            KILL (ONE-TIME)
                        </button>
                    </div>
                    {actionType === 'kill' && (
                        <p className="console-text" style={{
                            fontSize: 12, color: 'var(--ember-blood-3)',
                            marginTop: 6, marginBottom: 0,
                        }}>
                            ⚠ This is a ONE-TIME ability. Once used, you cannot use it again.
                        </p>
                    )}
                </div>
            )}

            {/* Detective's action type toggle */}
            {isDetectiveWithKillAbility && (
                <div style={{
                    marginBottom: 14,
                    padding: 12,
                    background: 'var(--ember-bg-0)',
                    border: '2px solid var(--ember-border)',
                }}>
                    <div className="pixel-text" style={{
                        fontSize: 9, color: 'var(--ember-ink-2)',
                        marginBottom: 8, letterSpacing: 1,
                    }}>
                        CHOOSE YOUR ACTION
                    </div>
                    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--ember-border)' }}>
                        <button
                            onClick={() => setActionType('investigate')}
                            disabled={isSubmitting}
                            className="pixel-text"
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: 8,
                                background: actionType === 'investigate' ? 'var(--ember-moon-2)' : 'var(--ember-bg-2)',
                                color: actionType === 'investigate' ? '#0a0a14' : 'var(--ember-ink-2)',
                                borderRight: '1px solid var(--ember-border)',
                                cursor: 'pointer',
                            }}
                        >
                            INVESTIGATE
                        </button>
                        <button
                            onClick={() => setActionType('kill')}
                            disabled={isSubmitting}
                            className="pixel-text"
                            style={{
                                flex: 1, padding: '8px 4px', fontSize: 8,
                                background: actionType === 'kill' ? 'var(--ember-blood-3)' : 'var(--ember-bg-2)',
                                color: actionType === 'kill' ? '#fff' : 'var(--ember-ink-2)',
                                cursor: 'pointer',
                            }}
                        >
                            KILL (ONE-TIME)
                        </button>
                    </div>
                    {actionType === 'kill' && (
                        <p className="console-text" style={{
                            fontSize: 12, color: 'var(--ember-blood-3)',
                            marginTop: 6, marginBottom: 0,
                        }}>
                            ⚠ This is a ONE-TIME ability. Once used, you cannot use it again.
                        </p>
                    )}
                </div>
            )}

            {/* Narrative hint textarea */}
            <div style={{ marginBottom: 14 }}>
                <label className="pixel-text" style={{
                    display: 'block', fontSize: 9,
                    color: 'var(--ember-ink-2)', marginBottom: 4, letterSpacing: 1,
                }}>
                    NARRATIVE HINT <span className="console-text" style={{ fontSize: 11, color: 'var(--ember-ink-3)' }}>(Optional)</span>
                </label>
                <p className="console-text" style={{
                    fontSize: 13, color: 'var(--ember-ink-3)',
                    margin: '0 0 6px 0',
                }}>
                    Describe how you imagine this action playing out. The Game Master will weave it into the night story.
                </p>
                <textarea
                    className="chat-input"
                    rows={3}
                    placeholder='e.g. "A shadow slipped through the fog, silent as death itself..."'
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSubmitting}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                />
            </div>

            {/* Warning box */}
            <div style={{
                background: 'var(--ember-bg-0)',
                padding: 10,
                border: '1px dashed var(--ember-border)',
                fontFamily: 'var(--f-console)',
                fontSize: 13,
                color: 'var(--ember-ink-2)',
                marginBottom: 14,
            }}>
                ⚠ This action is final.
                {currentRole === GAME_ROLES.WEREWOLF && ' Other wolves will see your choice.'}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="pbtn pbtn-ghost" onClick={handleClose} disabled={isSubmitting}>
                    CANCEL
                </button>
                <button
                    className={`pbtn ${actionType === 'kill' ? 'pbtn-danger' : 'pbtn-primary'}`}
                    disabled={!selectedPlayer || isSubmitting}
                    style={{
                        opacity: (selectedPlayer && !isSubmitting) ? 1 : 0.4,
                        borderColor: accent,
                    }}
                    onClick={handleSubmit}
                >
                    {isSubmitting ? '▸ ACTING...' : (
                        currentRole === GAME_ROLES.DOCTOR && actionType === 'kill'
                            ? "▸ DOCTOR'S MISTAKE"
                            : currentRole === GAME_ROLES.DETECTIVE && actionType === 'kill'
                                ? "▸ DETECTIVE'S KILL"
                                : `▸ ${(roleConfig.submitButtonText || 'ACT').toUpperCase()}`
                    )}
                </button>
            </div>
        </DraggableDialog>
    );
}
