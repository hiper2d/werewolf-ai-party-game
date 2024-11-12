'use client';

import React, {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {botPlayerPersonalities, buttonBlackStyle, gameRoles} from "@/app/constants";
import {createGame, previewGame} from '@/app/api/actions';
import {Game, GamePreview} from "@/app/api/models";
import {LLM_CONSTANTS} from "@/app/ai/models";

export default function CreateNewGamePage() {
    const [name, setName] = useState('');
    const [theme, setTheme] = useState('');
    const [description, setDescription] = useState('');
    const [playerCount, setPlayerCount] = useState(8);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState(['Doctor', 'Seer']);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [playersAiType, setPlayersAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<Game | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const playerOptions = Array.from({ length: 7 }, (_, i) => i + 6);
    const supportedAi = Object.values(LLM_CONSTANTS);
    const supportedPlayerAi = Object.values(LLM_CONSTANTS);
    const availableRoles = ['Doctor', 'Seer'];

    useEffect(() => {
        if (werewolfCount >= playerCount) {
            setWerewolfCount(playerCount - 1);
        }
    }, [playerCount, werewolfCount]);

    useEffect(() => {
        setIsFormValid(
            name.trim() !== '' &&
            theme.trim() !== ''
        );
    }, [name, theme]);

    const handleGeneratePreview = async () => {
        const gamePreviewData: GamePreview = {
            id: '',
            name,
            theme,
            description,
            playerCount,
            werewolfCount,
            specialRoles,
            gameMasterAiType,
            playersAiType
        };

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
    };

    const handleCreateGame = async () => {
        if (!gameData) {
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await createGame(gameData);
            router.push("/games");
        } catch (err: any) {
            setError(err.message);
            console.error("Error creating game:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStoryChange = (story: string) => {
        if (gameData) {
            setGameData({ ...gameData, story });
        }
    };

    const handlePlayerChange = (index: number, field: string, value: string) => {
        if (gameData) {
            const updatedPlayers = [...gameData.players];
            updatedPlayers[index] = { ...updatedPlayers[index], [field]: value };
            setGameData({ ...gameData, players: updatedPlayers });
        }
    };

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Game</h1>
                {!gameData ? (
                    <button
                        className={`${buttonBlackStyle} ${(!isFormValid || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleGeneratePreview}
                        disabled={!isFormValid || isLoading}
                    >
                        {isLoading ? 'Processing...' : 'Generate Game Preview'}
                    </button>
                ) : (
                    <div className="flex space-x-4">
                        <button
                            className={`${buttonBlackStyle} ${(!isFormValid || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Generate Game Preview Again'}
                        </button>
                        <button
                            className={`${buttonBlackStyle} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={handleCreateGame}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Create Game'}
                        </button>
                    </div>
                )}
            </div>

            <form id="create-game-form" className="space-y-4">
                <div className="flex space-x-4">
                    <input
                        className="w-1/2 p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <input
                        className="w-1/2 p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                        type="text"
                        placeholder="Theme"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        required
                    />
                </div>

                <textarea
                    className="w-full p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
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
                </div>

                <div className="flex space-x-4">
                    <div className="flex-1">
                        <label className="block text-white mb-2">Game Master AI Type:</label>
                        <select
                            className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                            value={gameMasterAiType}
                            onChange={(e) => setGameMasterAiType(e.target.value as string)}
                            required
                        >
                            {supportedAi.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-white mb-2">Players AI Type:</label>
                        <select
                            className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                            value={playersAiType}
                            onChange={(e) => setPlayersAiType(e.target.value)}
                            required
                        >
                            {supportedPlayerAi.map(model => (
                                <option key={model} value={model}>
                                    {model}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-white">Special Roles:</label>
                    <div className="flex flex-wrap gap-4 mt-2">
                        {availableRoles.map(role => (
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

            {/* Preview section remains unchanged */}
            {gameData && (
                <div className="mt-8">
                    <h2 className="text-2xl font-bold text-white mb-6">Preview</h2>

                    <div className="mb-4">
                        <label htmlFor="gameStory" className="block text-white mb-2">Game Story:</label>
                        <textarea
                            id="gameStory"
                            className="w-full p-3 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                            rows={5}
                            value={gameData.story}
                            onChange={(e) => handleStoryChange(e.target.value)}
                        />
                    </div>

                    <h3 className="text-xl font-bold text-white mb-4">Players:</h3>
                    {gameData.players.map((player, index) => (
                        <div key={index} className="mb-4 p-4 bg-gray-800 rounded">
                            <div className="flex items-center space-x-4 mb-2">
                                <input
                                    type="text"
                                    className="flex-grow p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                                    value={player.name}
                                    onChange={(e) => handlePlayerChange(index, 'name', e.target.value)}
                                    placeholder="Player Name"
                                />
                                <select
                                    className="p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                                    value={player.personality || ''}
                                    onChange={(e) => handlePlayerChange(index, 'personality', e.target.value)}
                                >
                                    <option value="">Select Personality</option>
                                    {botPlayerPersonalities.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                                <select
                                    className="p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-gray-500"
                                    value={player.aiType || ''}
                                    onChange={(e) => handlePlayerChange(index, 'aiType', e.target.value as string)}
                                >
                                    <option value="">Select AI Type</option>
                                    {supportedAi.map(ai => (
                                        <option key={ai} value={ai}>{ai}</option>
                                    ))}
                                </select>
                            </div>
                            <textarea
                                className="w-full p-2 rounded bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                                rows={3}
                                value={player.story}
                                onChange={(e) => handlePlayerChange(index, 'story', e.target.value)}
                                placeholder="Player's Story"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}