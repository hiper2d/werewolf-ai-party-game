'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { buttonBlackStyle } from "@/app/constants";
import { previewGame, createGame } from '@/app/api/actions';
import {Game, GamePreview} from "@/app/api/models";

export default function CreateNewGamePage() {
    const [name, setName] = useState('');
    const [theme, setTheme] = useState('');
    const [playerCount, setPlayerCount] = useState(8);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState(['doctor', 'sherif']);
    const [aiModel, setAiModel] = useState('Mixed');
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<Game | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const playerOptions = Array.from({ length: 7 }, (_, i) => i + 6);
    const specialRoleOptions = ['doctor', 'sherif', 'geisha'];
    const aiModelOptions = ['GPT-4o', 'Claude 3.5 Sonnet', 'Mistral Large', 'Groq Llama 3.1 405B', 'Mixed'];

    useEffect(() => {
        if (werewolfCount >= playerCount) {
            setWerewolfCount(playerCount - 1);
        }
    }, [playerCount, werewolfCount]);

    useEffect(() => {
        setIsFormValid(
            name.trim() !== '' &&
            theme.trim() !== '' &&
            playerCount > 0 &&
            werewolfCount >= 0 &&
            aiModel !== ''
        );
    }, [name, theme, playerCount, werewolfCount, aiModel]);

    const handleButtonClick = async () => {
        const gamePreviewData: GamePreview = {
            id: '',
            name,
            theme,
            playerCount,
            werewolfCount,
            specialRoles,
            aiModel
        };

        if (!gameData) {
            // Generate preview
            setIsLoading(true);
            setError(null);
            try {
                const game: Game = await previewGame(gamePreviewData);
                setGameData(game);
            } catch (err: any) {
                setError(err.message);
                console.error("Error previewing game:", err);
            } finally {
                setIsLoading(false);
            }
        } else {
            // Create game
            setIsLoading(true);
            setError(null);
            try {
                // fixme: implement this: await createGame(previewData);
                router.push("/games");
            } catch (err: any) {
                setError(err.message);
                console.error("Error creating game:", err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const buttonText = isLoading ? 'Processing...' : (gameData ? 'Create' : 'Preview');

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Game</h1>
                <button
                    className={`${buttonBlackStyle} ${(!isFormValid || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleButtonClick}
                    disabled={!isFormValid || isLoading}
                >
                    {buttonText}
                </button>
            </div>

            <form id="create-game-form" className="space-y-4">
                <input
                    className="w-1/2 p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
                <textarea
                    className="w-full p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                    placeholder="Theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    rows={3}
                    required
                />

                <div className="flex space-x-4">
                    <select
                        className="flex-1 p-3 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                        value={playerCount}
                        onChange={(e) => setPlayerCount(Number(e.target.value))}
                        required
                    >
                        {playerOptions.map(count => (
                            <option key={count} value={count}>{count} players</option>
                        ))}
                    </select>
                    <select
                        className="flex-1 p-3 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                        value={werewolfCount}
                        onChange={(e) => setWerewolfCount(Number(e.target.value))}
                        required
                    >
                        {Array.from({length: playerCount - 1}, (_, i) => (
                            <option key={i} value={i}>{i} werewolves</option>
                        ))}
                    </select>
                    <select
                        className="flex-1 p-3 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        required
                    >
                        {aiModelOptions.map(model => (
                            <option key={model} value={model}>{model}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-white">Special Roles:</label>
                    <div className="flex flex-wrap gap-4 mt-2">
                        {specialRoleOptions.map(role => (
                            <div key={role} className="flex items-center">
                                <input
                                    type="checkbox"
                                    id={role}
                                    checked={specialRoles.includes(role)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSpecialRoles([...specialRoles, role]);
                                        } else {
                                            setSpecialRoles(specialRoles.filter(r => r !== role));
                                        }
                                    }}
                                    className="mr-2"
                                />
                                <label htmlFor={role} className="text-white">{role}</label>
                            </div>
                        ))}
                    </div>
                </div>
            </form>

            {error && <p className="text-red-500 mt-2">{error}</p>}

            {gameData && (
                <div className="mt-8">
                    <h2 className="text-2xl font-bold text-white mb-6">Preview</h2>
                    <div className="flex h-full text-white overflow-hidden">
                        {/* Left column */}
                        <div className="w-1/4 flex flex-col pr-4 overflow-auto">
                            {/* Game info */}
                            <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                                <h3 className="text-2xl font-bold mb-2">{gameData.name}</h3>
                                <p className="text-sm text-gray-300 mb-4">{gameData.theme}</p>
                                <p className="text-white"><strong>Story:</strong> {gameData.story}</p>
                            </div>

                            {/* Participants list */}
                            <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4 flex-grow overflow-auto">
                                <h3 className="text-xl font-bold mb-2">Participants</h3>
                                <ul>
                                    {gameData.players.map((player, index) => (
                                        <li key={index} className="mb-1">{player.name}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Right column - Players */}
                        <div className="w-3/4 overflow-auto">
                            <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4">
                                <h3 className="text-xl font-bold text-white mb-4">Players:</h3>
                                <div className="space-y-4">
                                    {gameData.players.map((player, index) => (
                                        <div key={index} className="bg-black bg-opacity-30 rounded p-3">
                                            <p className="text-white"><strong>Name:</strong> {player.name}</p>
                                            <p className="text-white"><strong>Story:</strong> {player.story}</p>
                                            <p className="text-white"><strong>Personality:</strong> {player.personality}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}