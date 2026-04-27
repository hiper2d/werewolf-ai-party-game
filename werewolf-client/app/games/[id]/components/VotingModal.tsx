'use client';

import React, { useState } from 'react';
import SelectDropdown from '@/app/components/SelectDropdown';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';

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
            className="max-w-md w-full mx-4"
        >
            <div className="mb-6 space-y-4">
                <div>
                    <label className="block text-[12px] font-medium text-[var(--fg-1)] mb-1.5">
                        Who should be eliminated? <span className="text-[var(--danger)]">*</span>
                    </label>
                    <SelectDropdown
                        options={votableParticipants.map(p => ({ value: p.name, label: p.name }))}
                        value={selectedPlayer}
                        onChange={setSelectedPlayer}
                        placeholder="Select a player..."
                        disabled={isSubmitting}
                    />
                </div>

                <div>
                    <label className="block text-[12px] font-medium text-[var(--fg-1)] mb-1.5">
                        Reason for your vote <span className="text-[var(--danger)]">*</span>
                    </label>
                    <textarea
                        className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-0)] text-[13px] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms] resize-y"
                        rows={3}
                        placeholder="Explain why you think this player should be eliminated..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={isSubmitting}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <button
                    className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                    onClick={handleClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms] ${(!selectedPlayer || !reason.trim() || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSubmit}
                    disabled={!selectedPlayer || !reason.trim() || isSubmitting}
                >
                    {isSubmitting ? 'Submitting...' : 'Cast Vote'}
                </button>
            </div>
        </DraggableDialog>
    );
}
