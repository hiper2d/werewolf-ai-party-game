'use client';

import React, { useState } from 'react';
import SelectDropdown from '@/app/components/SelectDropdown';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';
import { INPUT_LIMITS } from '@/app/utils/input-limits';

interface VotingModalProps {
    onClose: () => void;
    onVote: (targetPlayer: string, reason: string) => void;
    game: any;
    isSubmitting?: boolean;
    /** Why the last submit was refused (the content screen in enforce mode); the draft stays. */
    notice?: string | null;
}

export default function VotingModal({
    onClose,
    onVote,
    game,
    isSubmitting = false,
    notice = null,
}: VotingModalProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('voting');
    const [selectedPlayer, setSelectedPlayer] = useState<string>('');
    const [reason, setReason] = useState<string>('');
    // The modal stays mounted for the whole game, so a successful vote leaves yesterday's pick
    // and reason in state. Start each opening empty (React's "adjust state on a prop change"
    // pattern). A refused submit keeps the modal open, so that draft survives on purpose.
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setSelectedPlayer('');
            setReason('');
        }
    }

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
    // The modal stays mounted between days, so the last vote's pick survives a successful
    // submit. Count it only while it is still a votable player: a target eliminated since
    // would show as the empty placeholder but still be sent ("Invalid target player").
    const currentPick = votableParticipants.some(p => p.name === selectedPlayer) ? selectedPlayer : '';

    const handleSubmit = async () => {
        if (currentPick && reason.trim()) {
            await onVote(currentPick, reason.trim());
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
                        value={currentPick}
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
                        maxLength={INPUT_LIMITS.voteReason}
                        disabled={isSubmitting}
                    />
                </div>
            </div>

            {notice && (
                <div role="alert" className="mb-3 px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--warn-soft)] border-[var(--warn-line)] text-[13px] text-[var(--warn-fg)]">
                    {notice}
                </div>
            )}
            <div className="flex justify-end gap-2">
                <button
                    className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                    onClick={handleClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms] ${(!currentPick || !reason.trim() || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSubmit}
                    disabled={!currentPick || !reason.trim() || isSubmitting}
                >
                    {isSubmitting ? 'Submitting...' : 'Cast Vote'}
                </button>
            </div>
        </DraggableDialog>
    );
}
