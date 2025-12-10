'use client';

import React, { useState } from 'react';
import { buttonTransparentStyle } from '@/app/constants';

interface VotingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVote: (targetPlayer: string, reason: string) => void;
    game: any; // Game object with participants info
    isSubmitting?: boolean;
}

export default function VotingModal({
    isOpen,
    onClose,
    onVote,
    game,
    isSubmitting = false
}: VotingModalProps) {
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [reason, setReason] = useState<string>('');

    if (!isOpen) return null;

    // Extract participants from game object
    const participants = [
        { name: game.humanPlayerName, isAlive: true, isHuman: true },
        ...game.bots.map((bot: any) => ({
            name: bot.name,
            isAlive: bot.isAlive,
            isHuman: false
        }))
    ];

    const votableParticipants = participants.filter(p => p.isAlive && !p.isHuman);

    const handleSubmit = () => {
        if (selectedPlayer && reason.trim()) {
            onVote(selectedPlayer, reason.trim());
            setSelectedPlayer('');
            setReason('');
        }
    };

    const handleClose = () => {
        setSelectedPlayer('');
        setReason('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="theme-bg-card theme-border border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-xl font-bold theme-text-primary mb-4">
                    Cast Your Vote
                </h3>

                <div className="mb-6">
                    <div className="mb-4">
                        <label className="block theme-text-primary text-sm mb-2">Who do you think should be eliminated?</label>
                        <select
                            className="w-full p-2 rounded bg-[rgb(var(--color-input-bg))] text-[rgb(var(--color-input-text))] border border-[rgb(var(--color-input-border))] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={selectedPlayer}
                            onChange={(e) => setSelectedPlayer(e.target.value)}
                            disabled={isSubmitting}
                        >
                            <option value="">Select a player...</option>
                            {votableParticipants.map((participant) => (
                                <option key={participant.name} value={participant.name}>
                                    {participant.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-4">
                        <label className="block theme-text-primary text-sm mb-2">Reason for your vote:</label>
                        <textarea
                            className="w-full p-2 rounded bg-[rgb(var(--color-input-bg))] text-[rgb(var(--color-input-text))] border border-[rgb(var(--color-input-border))] focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-[rgb(var(--color-input-placeholder))]"
                            rows={3}
                            placeholder="Explain why you think this player should be eliminated..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                </div>

                <div className="flex space-x-3 justify-end">
                    <button
                        className={`${buttonTransparentStyle}`}
                        onClick={handleClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        className={`${buttonTransparentStyle} ${(!selectedPlayer || !reason.trim() || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''} bg-red-600/80 hover:bg-red-700/80 text-white border-none`}
                        onClick={handleSubmit}
                        disabled={!selectedPlayer || !reason.trim() || isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : 'Cast Vote'}
                    </button>
                </div>
            </div>
        </div>
    );
}