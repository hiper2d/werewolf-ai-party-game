'use client';

import React, { useState } from 'react';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';
import CharacterSprite from '@/components/sprites/CharacterSprite';
import { getColor } from '@/utils/ember-colors';

interface VotingModalProps {
    onClose: () => void;
    onVote: (targetPlayer: string, reason: string) => void;
    game: any;
    isSubmitting?: boolean;
}

export default function VotingModal({
    onClose,
    onVote,
    game,
    isSubmitting = false
}: VotingModalProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('voting');
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [reason, setReason] = useState<string>('');

    if (!isOpen) return null;

    const participants = [
        { name: game.humanPlayerName, isAlive: true, isHuman: true },
        ...game.bots.map((bot: any) => ({
            name: bot.name,
            isAlive: bot.isAlive,
            isHuman: false
        }))
    ];

    const votableParticipants = participants.filter(p => p.isAlive && !p.isHuman);

    const handleSubmit = async () => {
        if (selectedPlayer && reason.trim()) {
            await onVote(selectedPlayer, reason.trim());
        }
    };

    const handleClose = () => {
        setSelectedPlayer('');
        setReason('');
        onClose();
    };

    return (
        <DraggableDialog
            isOpen={isOpen}
            title="Cast Your Vote"
            className="w-[560px]"
            accent="var(--ember-blood-3)"
            onClose={handleClose}
        >
            <p style={{ color: 'var(--ember-ink-1)', margin: '0 0 16px 0', fontSize: 14 }}>
                The village must eliminate a suspect. Choose carefully — the wolves are counting.
            </p>

            {/* Character sprite grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginBottom: 16,
            }}>
                {votableParticipants.map((p, i) => {
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
                                padding: 12,
                                background: isSelected ? color : 'var(--ember-bg-3)',
                                border: `2px solid ${isSelected ? 'var(--ember-ink-0)' : 'var(--ember-border)'}`,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 6,
                                color: isSelected ? '#0a0a14' : 'var(--ember-ink-1)',
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                opacity: isSubmitting ? 0.5 : 1,
                            }}
                        >
                            <CharacterSprite seed={i + 1} color={color} scale={1.6} />
                            <div className="pixel-text" style={{ fontSize: 9 }}>
                                {p.name.split(' ')[0]}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Reason textarea */}
            <div style={{ marginBottom: 16 }}>
                <label
                    className="pixel-text"
                    style={{
                        display: 'block',
                        fontSize: 9,
                        color: 'var(--ember-ink-2)',
                        marginBottom: 6,
                        letterSpacing: 1,
                    }}
                >
                    REASON FOR YOUR VOTE <span style={{ color: 'var(--ember-blood-3)' }}>*</span>
                </label>
                <textarea
                    className="chat-input"
                    rows={3}
                    placeholder="Explain why you think this player should be eliminated..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isSubmitting}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="pbtn pbtn-ghost" onClick={handleClose} disabled={isSubmitting}>
                    CANCEL
                </button>
                <button
                    className="pbtn pbtn-danger"
                    disabled={!selectedPlayer || !reason.trim() || isSubmitting}
                    style={{ opacity: (selectedPlayer && reason.trim() && !isSubmitting) ? 1 : 0.4 }}
                    onClick={handleSubmit}
                >
                    {isSubmitting ? '▸ VOTING...' : '▸ CAST VOTE'}
                </button>
            </div>
        </DraggableDialog>
    );
}
