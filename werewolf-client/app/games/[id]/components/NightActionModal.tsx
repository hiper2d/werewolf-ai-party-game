'use client';

import React, { useState } from 'react';
import { buttonTransparentStyle } from '@/app/constants';
import { ROLE_CONFIGS, Game, GAME_ROLES } from '@/app/api/game-models';

interface NightActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAction: (targetPlayer: string, message: string) => void;
    game: Game;
    currentRole: string;
    isLastInQueue: boolean; // Whether this is the last player in the action queue
    isSubmitting?: boolean;
}

export default function NightActionModal({
    isOpen,
    onClose,
    onAction,
    game,
    currentRole,
    isLastInQueue,
    isSubmitting = false
}: NightActionModalProps) {
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-white border-opacity-30 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-bold text-white mb-4">
                    {roleConfig.actionTitle}
                </h3>
                
                <div className="mb-2 text-sm text-gray-300">
                    {roleConfig.description}
                </div>
                
                <div className="mb-6">
                    <div className="mb-4">
                        <label className="block text-white text-sm mb-2">{roleConfig.targetLabel}</label>
                        <select
                            className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
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
                        <label className="block text-white text-sm mb-2">{getMessageLabel()}</label>
                        <textarea
                            className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
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
                        className={`${buttonTransparentStyle} bg-gray-600 hover:bg-gray-700 border-gray-500`}
                        onClick={handleClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        className={`${buttonTransparentStyle} ${(!selectedPlayer || !message.trim() || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleSubmit}
                        disabled={!selectedPlayer || !message.trim() || isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : roleConfig.submitButtonText}
                    </button>
                </div>
            </div>
        </div>
    );
}