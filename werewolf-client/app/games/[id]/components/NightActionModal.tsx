'use client';

import React, { useState } from 'react';
import { ROLE_CONFIGS, Game, GAME_ROLES } from '@/app/api/game-models';
import SelectDropdown from '@/app/components/SelectDropdown';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';

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

    const isDoctorWithKillAbility = currentRole === GAME_ROLES.DOCTOR && !game.oneTimeAbilitiesUsed?.doctorKill;
    const isDetectiveWithKillAbility = currentRole === GAME_ROLES.DETECTIVE && !game.oneTimeAbilitiesUsed?.detectiveKill;

    const roleConfig = ROLE_CONFIGS[currentRole];
    if (!roleConfig) return null;

    const getAvailableTargets = () => {
        const allPlayers = [
            { name: game.humanPlayerName, isAlive: true, isHuman: true },
            ...game.bots.map(bot => ({ name: bot.name, isAlive: bot.isAlive, isHuman: false }))
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

    const isKillAction = actionType === 'kill';

    return (
        <DraggableDialog
            isOpen={isOpen}
            title={roleConfig.actionTitle || 'Night Action'}
            className="max-w-md w-full mx-4"
        >
            <p className="text-[12px] text-[var(--fg-2)] mb-4">{roleConfig.description}</p>

            <div className="mb-6 space-y-4">
                <div>
                    <label className="block text-[12px] font-medium text-[var(--fg-1)] mb-1.5">
                        {roleConfig.targetLabel} <span className="text-[var(--danger)]">*</span>
                    </label>
                    <SelectDropdown
                        options={availableTargets.map(t => ({ value: t.name, label: t.name }))}
                        value={selectedPlayer}
                        onChange={setSelectedPlayer}
                        placeholder="Select a player..."
                        disabled={isSubmitting}
                    />
                </div>

                {/* Doctor action toggle */}
                {isDoctorWithKillAbility && (
                    <div className="p-3 rounded-[var(--radius-md)] border border-[var(--line-2)] bg-[var(--bg-2)]">
                        <label className="block text-[12px] font-semibold text-[var(--fg-0)] mb-2">Choose your action:</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                <input type="radio" name="doctorAction" value="protect" checked={actionType === 'protect'} onChange={() => setActionType('protect')} disabled={isSubmitting} className="accent-[var(--accent)]" />
                                <span className="text-[var(--fg-0)]">Protect</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                <input type="radio" name="doctorAction" value="kill" checked={actionType === 'kill'} onChange={() => setActionType('kill')} disabled={isSubmitting} className="accent-[var(--danger)]" />
                                <span className="text-[var(--danger)]">Kill (One-Time)</span>
                            </label>
                        </div>
                        {isKillAction && (
                            <p className="text-[11px] text-[var(--danger)] mt-2">Warning: This is a ONE-TIME ability. Once used, you cannot use it again.</p>
                        )}
                    </div>
                )}

                {/* Detective action toggle */}
                {isDetectiveWithKillAbility && (
                    <div className="p-3 rounded-[var(--radius-md)] border border-[var(--line-2)] bg-[var(--bg-2)]">
                        <label className="block text-[12px] font-semibold text-[var(--fg-0)] mb-2">Choose your action:</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                <input type="radio" name="detectiveAction" value="investigate" checked={actionType === 'investigate'} onChange={() => setActionType('investigate')} disabled={isSubmitting} className="accent-[var(--accent)]" />
                                <span className="text-[var(--fg-0)]">Investigate</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                                <input type="radio" name="detectiveAction" value="kill" checked={actionType === 'kill'} onChange={() => setActionType('kill')} disabled={isSubmitting} className="accent-[var(--danger)]" />
                                <span className="text-[var(--danger)]">Kill (One-Time)</span>
                            </label>
                        </div>
                        {isKillAction && (
                            <p className="text-[11px] text-[var(--danger)] mt-2">Warning: This is a ONE-TIME ability. Once used, you cannot use it again.</p>
                        )}
                    </div>
                )}

                <div>
                    <label className="block text-[12px] font-medium text-[var(--fg-1)] mb-1">
                        Narrative hint <span className="text-[11px] text-[var(--fg-3)] font-normal">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-[var(--fg-2)] mb-1.5">Describe how you imagine this action playing out. The Game Master will weave it into the night story.</p>
                    <textarea
                        className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-0)] text-[13px] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms] resize-y"
                        rows={3}
                        placeholder='e.g. "A shadow slipped through the fog, silent as death itself..."'
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
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
                    className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] ${isKillAction ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'} text-white hover:brightness-110 transition-all duration-[120ms] ${(!selectedPlayer || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSubmit}
                    disabled={!selectedPlayer || isSubmitting}
                >
                    {isSubmitting ? 'Submitting...' : (
                        currentRole === GAME_ROLES.DOCTOR && isKillAction ? "Doctor's Mistake (Kill)" :
                        currentRole === GAME_ROLES.DETECTIVE && isKillAction ? "Detective's Kill" :
                        roleConfig.submitButtonText
                    )}
                </button>
            </div>
        </DraggableDialog>
    );
}
