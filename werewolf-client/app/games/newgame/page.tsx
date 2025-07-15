'use client';

import React, {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {buttonBlackStyle, buttonTransparentStyle} from "@/app/constants";
import {createGame, previewGame} from '@/app/api/game-actions';
import {GAME_ROLES, GamePreview, GamePreviewWithGeneratedBots, GENDER_OPTIONS, getVoicesForGender, getRandomVoiceForGender} from "@/app/api/game-models";
import {LLM_CONSTANTS} from "@/app/ai/ai-models";
import {ttsService} from "@/app/services/tts-service";

export default function CreateNewGamePage() {
    const [name, setName] = useState('');
    const [theme, setTheme] = useState('');
    const [description, setDescription] = useState('');
    const [playerCount, setPlayerCount] = useState(8);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState([GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE]);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [playersAiType, setPlayersAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<GamePreviewWithGeneratedBots | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const router = useRouter();

    const playerOptions = Array.from({ length: 7 }, (_, i) => i + 6);
    const supportedAi = Object.values(LLM_CONSTANTS); // todo: this list should be limited to ApiKeys player uploaded
    const supportedPlayerAi = Object.values(LLM_CONSTANTS);
    const availableRoles = [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE];

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

    useEffect(() => {
        if (gameData && !gameData.gameMasterVoice) {
            setGameData({ ...gameData, gameMasterVoice: getRandomVoiceForGender('male') });
        }
    }, [gameData]);

    const handleGeneratePreview = async () => {
        const gamePreviewData: GamePreview = {
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
            const game: GamePreviewWithGeneratedBots = await previewGame(gamePreviewData);
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
            setGameData(gameData);
        }
    };

    const handlePlayerChange = (index: number, field: string, value: string) => {
        if (gameData) {
            const updatedPlayers = [...gameData.bots];
            updatedPlayers[index] = { ...updatedPlayers[index], [field]: value };
            setGameData({ ...gameData, bots: updatedPlayers });
        }
    };

    const handlePlayStory = async (story: string, voice: string) => {
        try {
            setIsSpeaking(true);
            await ttsService.speakText(story, { voice: voice as any });
            setIsSpeaking(false);
        } catch (error) {
            console.error('TTS Error:', error);
            setIsSpeaking(false);
        }
    };

    const handleStopTTS = () => {
        ttsService.stopSpeaking();
        setIsSpeaking(false);
    };

    // Common styles
    const inputStyle = "p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50";
    const labelStyle = "text-white whitespace-nowrap w-36";
    const flexRowStyle = "flex space-x-4";
    const flexItemStyle = "flex-1 flex items-center space-x-2";
    const buttonDisabledStyle = "opacity-50 cursor-not-allowed";

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Game</h1>
                <div className={`${flexRowStyle} justify-end mb-4`}>
                    <button
                        className={`${buttonBlackStyle} ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                        onClick={handleGeneratePreview}
                        disabled={!isFormValid || isLoading}
                    >
                        {isLoading ? 'Processing...' : (gameData ? 'Generate Preview Again' : 'Generate Preview')}
                    </button>
                    {gameData && (
                        <button
                            className={`${buttonBlackStyle} ${isLoading ? buttonDisabledStyle : ''}`}
                            onClick={handleCreateGame}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Create Game'}
                        </button>
                    )}
                </div>
            </div>

            <form id="create-game-form" className="space-y-2">
                <div className="flex space-x-2">
                    <input
                        className="w-1/2 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <input
                        className="w-1/2 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                        type="text"
                        placeholder="Theme"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        required
                    />
                </div>

                <textarea
                    className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                />

                <div className={flexRowStyle}>
                    <div className={flexItemStyle}>
                        <label className={labelStyle}>Player Count:</label>
                        <select
                            className={`${inputStyle} flex-1`}
                            value={playerCount}
                            onChange={(e) => setPlayerCount(Number(e.target.value))}
                            required
                        >
                            {playerOptions.map(count => (
                                <option key={count} value={count}>{count} players</option>
                            ))}
                        </select>
                    </div>
                    <div className={flexItemStyle}>
                        <label className={labelStyle}>Werewolf Count:</label>
                        <select
                            className={`${inputStyle} flex-1`}
                            value={werewolfCount}
                            onChange={(e) => setWerewolfCount(Number(e.target.value))}
                            required
                        >
                            {Array.from({length: playerCount - 1}, (_, i) => (
                                <option key={i} value={i}>{i} werewolves</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={flexRowStyle}>
                    <div className={flexItemStyle}>
                        <label className={labelStyle}>Game Master AI:</label>
                        <select
                            className={`${inputStyle} flex-1`}
                            value={gameMasterAiType}
                            onChange={(e) => setGameMasterAiType(e.target.value as string)}
                            required
                        >
                            {supportedAi.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                    <div className={flexItemStyle}>
                        <label className={labelStyle}>Players AI:</label>
                        <select
                            className={`${inputStyle} flex-1`}
                            value={playersAiType}
                            onChange={(e) => setPlayersAiType(e.target.value)}
                            required
                        >
                            {supportedPlayerAi.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={flexRowStyle}>
                    <div className={flexItemStyle}>
                        <label className={labelStyle}>Special Roles:</label>
                        <div className="flex gap-4">
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
                                    <label htmlFor={role} className="text-white">
                                        {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </label>
                                </div>
                            ))}
                        </div>
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
                            className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                            rows={5}
                            value={gameData.scene}
                            onChange={(e) => handleStoryChange(e.target.value)}
                        />
                    </div>

                    <div className="mb-6">
                        <h3 className="text-xl font-bold text-white mb-4">Game Master:</h3>
                        <div className="p-4 bg-gray-900 bg-opacity-50 rounded-lg">
                            <div className="flex space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">AI Model:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={gameData.gameMasterAiType}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterAiType: e.target.value })}
                                    >
                                        {supportedAi.filter(model => model !== LLM_CONSTANTS.RANDOM).map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">Voice:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={gameData.gameMasterVoice || getVoicesForGender('male')[0]}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterVoice: e.target.value })}
                                    >
                                        {getVoicesForGender('male').map(voice => (
                                            <option key={voice} value={voice}>{voice}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col justify-end">
                                    <button
                                        className={`w-10 h-10 ${buttonTransparentStyle} ${(!gameData.scene || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
                                        onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gameData.gameMasterVoice || getVoicesForGender('male')[0])}
                                        disabled={!gameData.scene}
                                        title={isSpeaking ? "Stop speaking" : "Play game story"}
                                    >
                                        <span className="text-lg">
                                            {isSpeaking ? '⏹️' : '🔊'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-4">Players:</h3>
                    {gameData.bots.map((player, index) => (
                        <div key={index} className="mb-4 p-4 bg-gray-900 bg-opacity-50 rounded-lg">
                            <div className="flex space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">Name:</label>
                                    <input
                                        type="text"
                                        className="w-full h-10 p-2 rounded bg-gray-900 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.name}
                                        onChange={(e) => handlePlayerChange(index, 'name', e.target.value)}
                                        placeholder="Player Name"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">AI Model:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.playerAiType}
                                        onChange={(e) => handlePlayerChange(index, 'playerAiType', e.target.value)}
                                    >
                                        {supportedPlayerAi.filter(model => model !== LLM_CONSTANTS.RANDOM).map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-10">
                                    {/* Empty space to align with play button below */}
                                </div>
                            </div>
                            <div className="flex space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">Gender:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.gender}
                                        onChange={(e) => handlePlayerChange(index, 'gender', e.target.value)}
                                    >
                                        {GENDER_OPTIONS.map(gender => (
                                            <option key={gender} value={gender}>
                                                {gender.charAt(0).toUpperCase() + gender.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">Voice:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.voice}
                                        onChange={(e) => handlePlayerChange(index, 'voice', e.target.value)}
                                    >
                                        {getVoicesForGender(player.gender).map(voice => (
                                            <option key={voice} value={voice}>{voice}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col justify-end">
                                    <button
                                        className={`w-10 h-10 ${buttonTransparentStyle} ${(!player.story || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
                                        onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(player.story, player.voice)}
                                        disabled={!player.story}
                                        title={isSpeaking ? "Stop speaking" : "Play story"}
                                    >
                                        <span className="text-lg">
                                            {isSpeaking ? '⏹️' : '🔊'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Story:</label>
                                <textarea
                                    className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                    rows={3}
                                    value={player.story}
                                    onChange={(e) => handlePlayerChange(index, 'story', e.target.value)}
                                    placeholder="Player's Story"
                                />
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-end space-x-4 mt-6">
                        <button
                            className={`${buttonTransparentStyle} ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Generate Preview Again'}
                        </button>
                        <button
                            className={`${buttonTransparentStyle} ${isLoading ? buttonDisabledStyle : ''}`}
                            onClick={handleCreateGame}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Create Game'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}