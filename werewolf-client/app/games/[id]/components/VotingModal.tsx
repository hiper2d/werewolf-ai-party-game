'use client';

import { useState } from 'react';
import { buttonTransparentStyle } from "@/app/constants";

interface VotingModalProps {
    isOpen: boolean;
    alivePlayers: string[];
    humanPlayerName: string;
    onSubmit: (votedFor: string, reasoning: string) => void;
    onClose: () => void;
}

export default function VotingModal({
    isOpen,
    alivePlayers,
    humanPlayerName,
    onSubmit,
    onClose
}: VotingModalProps) {
    const [selectedPlayer, setSelectedPlayer] = useState('');
    const [reasoning, setReasoning] = useState('');

    if (!isOpen) return null;

    // Filter out the human player from voting options (can't vote for themselves)
    const availableTargets = alivePlayers.filter(player => player !== humanPlayerName);

    const handleSubmit = () => {
        if (selectedPlayer && reasoning.trim()) {
            onSubmit(selectedPlayer, reasoning);
            setSelectedPlayer('');
            setReasoning('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-white border-opacity-30 rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-white mb-4">
                    Cast Your Vote
                </h2>
                
                <p className="text-gray-300 mb-2">
                    Who do you think should be eliminated?
                </p>
                
                <p className="text-gray-400 text-sm mb-4">
                    Choose carefully - your vote could determine the outcome of the game.
                </p>

                <div className="mb-4">
                    <label className="block text-white mb-2">Vote for:</label>
                    <select
                        value={selectedPlayer}
                        onChange={(e) => setSelectedPlayer(e.target.value)}
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
                    <label className="block text-white mb-2">Reasoning:</label>
                    <textarea
                        value={reasoning}
                        onChange={(e) => setReasoning(e.target.value)}
                        placeholder="Explain why you think this player should be eliminated..."
                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                        rows={4}
                        required
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
                        disabled={!selectedPlayer || !reasoning.trim()}
                        className={`${buttonTransparentStyle} ${(!selectedPlayer || !reasoning.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Cast Vote
                    </button>
                </div>
            </div>
        </div>
    );
}