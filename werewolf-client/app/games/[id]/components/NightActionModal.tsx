'use client';

import React, { useState } from 'react';
import { buttonTransparentStyle } from '@/app/constants';
import { ROLE_CONFIGS, Game, GAME_ROLES } from '@/app/api/game-models';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';

interface NightActionModalProps {
    onClose: () => void;
    onAction: (targetPlayer: string, message: string) => void;
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

    if (!isOpen) return null;

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

        switch (currentRole) {
            case GAME_ROLES.WEREWOLF:
                // Can target anyone alive except themselves
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
            case GAME_ROLES.DOCTOR:
                // Can protect anyone alive including themselves
                return allPlayers.filter(p => p.isAlive);
            case GAME_ROLES.DETECTIVE:
                // Can investigate anyone alive except themselves
                return allPlayers.filter(p => p.isAlive && p.name !== game.humanPlayerName);
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
        if (selectedPlayer && message.trim()) {
            onAction(selectedPlayer, message.trim());
            setSelectedPlayer('');
            setMessage('');
        }
    };

    const handleClose = () => {
        setSelectedPlayer('');
        setMessage('');
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

                <div className="mb-4">
                    <label className="block theme-text-primary text-sm mb-2">{getMessageLabel()}</label>
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
                    className={`${buttonTransparentStyle} ${(!selectedPlayer || !message.trim() || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''} bg-blue-600/80 hover:bg-blue-700/80 text-white border-none`}
                    onClick={handleSubmit}
                    disabled={!selectedPlayer || !message.trim() || isSubmitting}
                >
                    {isSubmitting ? 'Submitting...' : roleConfig.submitButtonText}
                </button>
            </div>
        </DraggableDialog>
    );
}