'use client';

import React, {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {buttonBlackStyle, buttonTransparentStyle} from "@/app/constants";
import {createGame, previewGame} from '@/app/api/game-actions';
import {GAME_ROLES, GamePreview, GamePreviewWithGeneratedBots, GENDER_OPTIONS, getVoicesForGender, getRandomVoiceForGender, PLAY_STYLES, PLAY_STYLE_CONFIGS} from "@/app/api/game-models";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {ttsService} from "@/app/services/tts-service";

export default function CreateNewGamePage() {
    const [name, setName] = useState('');
    const [theme, setTheme] = useState('');
    const [description, setDescription] = useState('');
    const [playerCount, setPlayerCount] = useState(8);
    const [werewolfCount, setWerewolfCount] = useState(2);
    const [specialRoles, setSpecialRoles] = useState([GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE]);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [playersAiType, setPlayersAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<GamePreviewWithGeneratedBots | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showPlayStyleTooltip, setShowPlayStyleTooltip] = useState<number | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [botNameErrors, setBotNameErrors] = useState<{[key: number]: string}>({});
    const router = useRouter();

    const playerOptions = Array.from({ length: 7 }, (_, i) => i + 6);
    const supportedAi = Object.values(LLM_CONSTANTS); // todo: this list should be limited to ApiKeys player uploaded
    const supportedPlayerAi = Object.values(LLM_CONSTANTS);

    // Helper function to check if a model has thinking capabilities
    const hasThinkingMode = (aiType: string): boolean => {
        if (aiType === LLM_CONSTANTS.RANDOM) return true; // Allow thinking mode for random (will be applied to actual model)
        const modelConfig = SupportedAiModels[aiType];
        return modelConfig?.hasThinking === true;
    };

    // Helper function to validate names (only letters, numbers, no spaces)
    const validateName = (name: string): string | null => {
        if (!name.trim()) {
            return "Name cannot be empty";
        }
        if (!/^[a-zA-Z0-9]+$/.test(name.trim())) {
            return "Name can only contain letters and numbers (no spaces)";
        }
        return null;
    };

    const availableRoles = [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE];

    useEffect(() => {
        if (werewolfCount >= playerCount) {
            setWerewolfCount(playerCount - 1);
        }
    }, [playerCount, werewolfCount]);

    useEffect(() => {
        const nameValidationError = validateName(name);
        setNameError(nameValidationError);
        
        setIsFormValid(
            name.trim() !== '' &&
            theme.trim() !== '' &&
            !nameValidationError
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
            
            // Set all thinking modes to false by default
            const updatedGame: GamePreviewWithGeneratedBots = {
                ...game,
                gameMasterThinking: false,
                bots: game.bots.map(bot => ({
                    ...bot,
                    enableThinking: false
                }))
            };
            
            // Validate initial bot names
            const initialBotNameErrors: {[key: number]: string} = {};
            updatedGame.bots.forEach((bot, index) => {
                const nameValidationError = validateName(bot.name);
                if (nameValidationError) {
                    initialBotNameErrors[index] = nameValidationError;
                }
            });
            setBotNameErrors(initialBotNameErrors);
            
            setGameData(updatedGame);
        } catch (err: any) {
            // Provide user-friendly error messages for common issues
            let userFriendlyError = err.message;
            
            if (err.message.includes('Failed to parse JSON response') || err.message.includes('JSON mode failed')) {
                userFriendlyError = `The AI model had trouble generating a properly formatted response. This sometimes happens with certain models. Please try again, or consider using a different AI model for the Game Master.`;
            } else if (err.message.includes('Response validation failed')) {
                userFriendlyError = `The AI model generated an invalid response format. Please try again or use a different AI model.`;
            } else if (err.message.includes('Failed to get response') || err.message.includes('API')) {
                userFriendlyError = `Unable to connect to the AI service. Please check your API keys and try again.`;
            }
            
            setError(userFriendlyError);
            console.error("Error previewing game:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateGame = async () => {
        if (!gameData) {
            return;
        }

        // Check for any validation errors in bot names
        const hasNameErrors = Object.values(botNameErrors).some(error => error);
        if (hasNameErrors) {
            setError("Please fix all name validation errors before creating the game");
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

    const handlePlayerChange = (index: number, field: string, value: string | boolean) => {
        if (gameData) {
            const updatedPlayers = [...gameData.bots];
            updatedPlayers[index] = { ...updatedPlayers[index], [field]: value };
            setGameData({ ...gameData, bots: updatedPlayers });

            // Validate bot names
            if (field === 'name' && typeof value === 'string') {
                const nameValidationError = validateName(value);
                setBotNameErrors(prev => ({
                    ...prev,
                    [index]: nameValidationError || ''
                }));
            }
        }
    };

    // Reset individual bot thinking mode when the game master AI model changes in preview
    const handleGameMasterAiChange = (newAiType: string) => {
        if (gameData) {
            const updatedData = { ...gameData, gameMasterAiType: newAiType };
            // If the new model doesn't support thinking, disable it
            if (!hasThinkingMode(newAiType)) {
                updatedData.gameMasterThinking = false;
            }
            setGameData(updatedData);
        }
    };

    // Reset individual bot thinking mode when a bot's AI model changes in preview
    const handleBotAiChange = (index: number, newAiType: string) => {
        if (gameData) {
            const updatedPlayers = [...gameData.bots];
            updatedPlayers[index] = { ...updatedPlayers[index], playerAiType: newAiType };
            // If the new model doesn't support thinking, disable it for this bot
            if (!hasThinkingMode(newAiType)) {
                updatedPlayers[index].enableThinking = false;
            }
            setGameData({ ...gameData, bots: updatedPlayers });
        }
    };

    const handlePlayStory = async (story: string, voice: string, voiceInstructions?: string) => {
        try {
            setIsSpeaking(true);
            await ttsService.speakText(story, { 
                voice: voice as any,
                instructions: voiceInstructions 
            });
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
    const labelStyle = "text-white whitespace-nowrap w-full sm:w-36";
    const flexRowStyle = "flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4";
    const flexItemStyle = "flex-1 flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2";
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
                        {isLoading ? (
                            <span className="flex items-center space-x-2">
                                <span className="animate-spin">⏳</span>
                                <span>Generating Preview...</span>
                            </span>
                        ) : (gameData ? 'Generate Preview Again' : 'Generate Preview')}
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
                    <div className="w-1/2">
                        <input
                            className={`w-full p-2 rounded bg-black bg-opacity-30 text-white border ${nameError ? 'border-red-500' : 'border-white border-opacity-30'} focus:outline-none focus:border-white focus:border-opacity-50`}
                            type="text"
                            placeholder="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
                    </div>
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
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 sm:flex-1">
                        <label className={labelStyle}>Game Master AI:</label>
                        <select
                            className={`${inputStyle} w-full sm:flex-1`}
                            value={gameMasterAiType}
                            onChange={(e) => setGameMasterAiType(e.target.value as string)}
                            required
                        >
                            {supportedAi.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 sm:flex-1">
                        <label className={labelStyle}>Players AI:</label>
                        <select
                            className={`${inputStyle} w-full sm:flex-1`}
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

            {isLoading && (
                <div className="mt-4 p-4 bg-blue-900 bg-opacity-50 border border-blue-500 rounded-lg">
                    <div className="flex items-start space-x-2">
                        <span className="text-blue-400 text-lg animate-spin">⏳</span>
                        <div>
                            <h3 className="text-blue-400 font-semibold mb-1">Generating Game Preview...</h3>
                            <p className="text-blue-300 text-sm">The AI is creating your game story and characters. This may take a moment.</p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-4 p-4 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg">
                    <div className="flex items-start space-x-2">
                        <span className="text-red-400 text-lg">⚠️</span>
                        <div>
                            <h3 className="text-red-400 font-semibold mb-1">Game Preview Generation Failed</h3>
                            <p className="text-red-300 text-sm">{error}</p>
                        </div>
                    </div>
                </div>
            )}

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
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">AI Model:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={gameData.gameMasterAiType}
                                        onChange={(e) => handleGameMasterAiChange(e.target.value)}
                                    >
                                        {supportedAi.filter(model => model !== LLM_CONSTANTS.RANDOM).map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 flex gap-2">
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
                                            onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gameData.gameMasterVoice || getVoicesForGender('male')[0], gameData.gameMasterVoiceInstructions)}
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
                            {gameData.gameMasterVoiceInstructions && (
                                <div className="mt-2">
                                    <label className="block text-gray-400 text-sm mb-1">Voice Instructions:</label>
                                    <textarea
                                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        rows={2}
                                        value={gameData.gameMasterVoiceInstructions}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterVoiceInstructions: e.target.value })}
                                        placeholder="Voice instructions for the Game Master..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-4">Players:</h3>
                    {gameData.bots.map((player, index) => (
                        <div key={index} className="mb-4 p-4 bg-gray-900 bg-opacity-50 rounded-lg">
                            <div className="flex flex-col gap-2 mb-2">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex-1">
                                        <label className="block text-gray-400 text-sm mb-1">Name:</label>
                                        <input
                                            type="text"
                                            className={`w-full h-10 p-2 rounded bg-gray-900 text-white border ${botNameErrors[index] ? 'border-red-500' : 'border-white border-opacity-30'} focus:outline-none focus:border-white focus:border-opacity-50`}
                                            value={player.name}
                                            onChange={(e) => handlePlayerChange(index, 'name', e.target.value)}
                                            placeholder="Player Name"
                                        />
                                        {botNameErrors[index] && <p className="text-red-500 text-xs mt-1">{botNameErrors[index]}</p>}
                                    </div>
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
                                    <div className="flex-1 flex gap-2">
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
                                                onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(player.story, player.voice, player.voiceInstructions)}
                                                disabled={!player.story}
                                                title={isSpeaking ? "Stop speaking" : "Play story"}
                                            >
                                                <span className="text-lg">
                                                    {isSpeaking ? '⏹️' : '🔊'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">AI Model:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.playerAiType}
                                        onChange={(e) => handleBotAiChange(index, e.target.value)}
                                    >
                                        {supportedPlayerAi.filter(model => model !== LLM_CONSTANTS.RANDOM).map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-gray-400 text-sm mb-1">
                                            Play Style:
                                        </label>
                                        <select
                                            className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                            value={player.playStyle}
                                            onChange={(e) => handlePlayerChange(index, 'playStyle', e.target.value)}
                                        >
                                            {Object.values(PLAY_STYLES).map(style => (
                                                <option key={style} value={style}>
                                                    {style.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="relative flex flex-col justify-end">
                                        <button
                                            type="button"
                                            className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-xs flex items-center justify-center transition-colors"
                                            onMouseEnter={() => setShowPlayStyleTooltip(index)}
                                            onMouseLeave={() => setShowPlayStyleTooltip(null)}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setShowPlayStyleTooltip(showPlayStyleTooltip === index ? null : index);
                                            }}
                                        >
                                            ?
                                        </button>
                                        {showPlayStyleTooltip === index && (
                                            <div className="absolute z-10 w-64 sm:w-72 md:w-80 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-sm text-white top-full mt-2 right-0 transform -translate-x-full sm:-translate-x-3/4 md:translate-x-0">
                                                <div className="font-semibold mb-2">
                                                    {PLAY_STYLE_CONFIGS[player.playStyle]?.name || player.playStyle}
                                                </div>
                                                <div className="text-gray-300">
                                                    {PLAY_STYLE_CONFIGS[player.playStyle]?.uiDescription || 'No description available'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
                            {player.voiceInstructions && (
                                <div className="mt-2">
                                    <label className="block text-gray-400 text-sm mb-1">Voice Instructions:</label>
                                    <textarea
                                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        rows={2}
                                        value={player.voiceInstructions}
                                        onChange={(e) => handlePlayerChange(index, 'voiceInstructions', e.target.value)}
                                        placeholder="Voice instructions for this character..."
                                    />
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="flex justify-end space-x-4 mt-6">
                        <button
                            className={`${buttonTransparentStyle} ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? (
                                <span className="flex items-center space-x-2">
                                    <span className="animate-spin">⏳</span>
                                    <span>Generating Preview...</span>
                                </span>
                            ) : 'Generate Preview Again'}
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