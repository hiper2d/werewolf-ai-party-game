'use client';

import { useState } from 'react';
import { buttonTransparentStyle } from "@/app/constants";

interface NightActionModalProps {
    isOpen: boolean;
    role: string;
    alivePlayers: string[];
    humanPlayerName: string;
    onSubmit: (targetPlayer: string, comment: string) => void;
    onClose: () => void;
}

export default function NightActionModal({
    isOpen,
    role,
    alivePlayers,
    humanPlayerName,
    onSubmit,
    onClose
}: NightActionModalProps) {
    const [selectedTarget, setSelectedTarget] = useState('');
    const [comment, setComment] = useState('');

    if (!isOpen) return null;

    const availableTargets = role === 'doctor' 
        ? alivePlayers // Doctor can save anyone including themselves
        : alivePlayers.filter(player => player !== humanPlayerName); // Others can't target themselves

    const handleSubmit = () => {
        if (selectedTarget) {
            onSubmit(selectedTarget, comment);
            setSelectedTarget('');
            setComment('');
        }
    };

    const getRoleActionText = () => {
        switch (role) {
            case 'werewolf':
                return 'Choose your victim for tonight';
            case 'doctor':
                return 'Choose a player to save tonight';
            case 'detective':
                return 'Choose a player to investigate tonight';
            default:
                return 'Choose your target';
        }
    };

    const getRoleInstructions = () => {
        switch (role) {
            case 'werewolf':
                return 'As a werewolf, you must eliminate a player tonight. Choose carefully to avoid suspicion.';
            case 'doctor':
                return 'As a doctor, you can save one player from being eliminated. You can save yourself or another player.';
            case 'detective':
                return 'As a detective, you can investigate one player to learn their true role. Use this information wisely.';
            default:
                return '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-white border-opacity-30 rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-white mb-4">
                    Night Action - {role.charAt(0).toUpperCase() + role.slice(1)}
                </h2>
                
                <p className="text-gray-300 mb-2">
                    {getRoleActionText()}
                </p>
                
                <p className="text-gray-400 text-sm mb-4">
                    {getRoleInstructions()}
                </p>

                <div className="mb-4">
                    <label className="block text-white mb-2">Target Player:</label>
                    <select
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                    >
                        <option value="">Select a player...</option>
                        {availableTargets.map(player => (
                            <option key={player} value={player}>
                                {player}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mb-6">
                    <label className="block text-white mb-2">Comment (optional):</label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Your thoughts on this action..."
                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                        rows={3}
                    />
                </div>

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className={`${buttonTransparentStyle} border-gray-500`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedTarget}
                        className={`${buttonTransparentStyle} ${!selectedTarget ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Confirm Action
                    </button>
                </div>
            </div>
        </div>
    );
}