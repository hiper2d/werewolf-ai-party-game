'use client';

import React, { useState } from 'react';
import { buttonTransparentStyle } from '@/app/constants';
import { ROLE_CONFIGS, Game, GAME_ROLES } from '@/app/api/game-models';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';

interface NightActionModalProps {
    onClose: () => void;
    onAction: (targetPlayer: string, message: string, actionType?: 'protect' | 'kill') => void;
    game: Game;
    currentRole: string;
    isLastInQueue: boolean; // Whether this is the last player in the action queue
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
    const [actionType, setActionType] = useState<'protect' | 'kill'>('protect');

    if (!isOpen) return null;

    // Check if Doctor's kill ability is available
    const isDoctorWithKillAbility = currentRole === GAME_ROLES.DOCTOR &&
        !game.oneTimeAbilitiesUsed?.doctorKill;

    const roleConfig = ROLE_CONFIGS[currentRole];
    if (!roleConfig) {
        console.error(`Role config not found for role: ${currentRole}`);
        return null;
    }

    // Get available targets based on role
    const getAvailableTargets = () => {
        const allPlayers = [
            { name: game.humanPlayerName, isAlive: true, isHuman: true },
            ...game.bots.map(bot => ({
                name: bot.name,
                isAlive: bot.isAlive,
                isHuman: false
            }))
        ];

        // Get previous target for roles that can't target same player twice in a row
        const previousTarget = game.previousNightResults?.[currentRole]?.target;

        switch (currentRole) {
            case GAME_ROLES.WEREWOLF:
                // Can target anyone alive except themselves (and other werewolves)
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
            case GAME_ROLES.DOCTOR:
                // Can protect anyone alive including themselves, but not same target as last night
                return allPlayers.filter(p =>
                    p.isAlive &&
                    p.name !== previousTarget
                );
            case GAME_ROLES.DETECTIVE:
                // Can investigate anyone alive except themselves
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
            case GAME_ROLES.MANIAC:
                // Can abduct anyone alive except themselves, but not same target as last night
                return allPlayers.filter(p =>
                    p.isAlive &&
                    p.name !== game.humanPlayerName &&
                    p.name !== previousTarget
                );
            default:
                return [];
        }
    };

    const availableTargets = getAvailableTargets();

    const getMessageLabel = () => {
        if (isLastInQueue) {
            return `Last ${roleConfig.messageLabel}`;
        } else {
            return roleConfig.messageLabel;
        }
    };

    const handleSubmit = () => {
        if (selectedPlayer) {
            const finalMessage = message.trim() || '';
            // Include actionType only for Doctor (when kill ability might be used)
            if (currentRole === GAME_ROLES.DOCTOR) {
                onAction(selectedPlayer, finalMessage, actionType);
            } else {
                onAction(selectedPlayer, finalMessage);
            }
            setSelectedPlayer('');
            setMessage('');
            setActionType('protect');  // Reset to default
        }
    };

    const handleClose = () => {
        setSelectedPlayer('');
        setMessage('');
        setActionType('protect');  // Reset to default
        onClose();
    };

    return (
        <DraggableDialog
            isOpen={isOpen}
            title={roleConfig.actionTitle || 'Night Action'}
            className="max-w-md w-full mx-4"
        >
            <div className="mb-2 text-sm theme-text-secondary">
                {roleConfig.description}
            </div>

            <div className="mb-6">
                <div className="mb-4">
                    <label className="block theme-text-primary text-sm mb-2">{roleConfig.targetLabel}</label>
                    <select
                        className="w-full p-2 rounded bg-[rgb(var(--color-input-bg))] text-[rgb(var(--color-input-text))] border border-[rgb(var(--color-input-border))] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={selectedPlayer}
                        onChange={(e) => setSelectedPlayer(e.target.value)}
                        disabled={isSubmitting}
                    >
                        <option value="">Select a player...</option>
                        {availableTargets.map((target) => (
                            <option key={target.name} value={target.name}>
                                {target.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Doctor's action type toggle - only show when kill ability is available */}
                {isDoctorWithKillAbility && (
                    <div className="mb-4 p-3 rounded border border-[rgb(var(--color-input-border))] bg-[rgb(var(--color-input-bg))]">
                        <label className="block theme-text-primary text-sm mb-2 font-semibold">
                            Choose your action:
                        </label>
                        <div className="flex space-x-4">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="radio"
                                    name="doctorAction"
                                    value="protect"
                                    checked={actionType === 'protect'}
                                    onChange={() => setActionType('protect')}
                                    disabled={isSubmitting}
                                    className="mr-2"
                                />
                                <span className="theme-text-primary">
                                    Protect
                                </span>
                            </label>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="radio"
                                    name="doctorAction"
                                    value="kill"
                                    checked={actionType === 'kill'}
                                    onChange={() => setActionType('kill')}
                                    disabled={isSubmitting}
                                    className="mr-2"
                                />
                                <span className="text-red-400">
                                    Kill (One-Time)
                                </span>
                            </label>
                        </div>
                        {actionType === 'kill' && (
                            <p className="text-xs text-red-400 mt-2">
                                Warning: This is a ONE-TIME ability. Once used, you cannot use it again.
                            </p>
                        )}
                    </div>
                )}

                <div className="mb-4">
                    <label className="block theme-text-primary text-sm mb-2">{getMessageLabel()} <span className="text-xs theme-text-secondary font-normal">(Optional)</span></label>
                    <textarea
                        className="w-full p-2 rounded bg-[rgb(var(--color-input-bg))] text-[rgb(var(--color-input-text))] border border-[rgb(var(--color-input-border))] focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-[rgb(var(--color-input-placeholder))]"
                        rows={3}
                        placeholder={roleConfig.messagePlaceholder}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
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
                    className={`${buttonTransparentStyle} ${(!selectedPlayer || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''} ${actionType === 'kill' ? 'bg-red-600/80 hover:bg-red-700/80 border-red-500' : 'bg-blue-600/80 hover:bg-blue-700/80 border-blue-500'} text-white`}
                    onClick={handleSubmit}
                    disabled={!selectedPlayer || isSubmitting}
                >
                    {isSubmitting ? 'Submitting...' : (
                        currentRole === GAME_ROLES.DOCTOR && actionType === 'kill'
                            ? "Doctor's Mistake (Kill)"
                            : roleConfig.submitButtonText
                    )}
                </button>
            </div>
        </DraggableDialog>
    );
}