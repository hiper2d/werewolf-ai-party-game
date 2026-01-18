'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {buttonBlackStyle, buttonTransparentStyle} from "@/app/constants";
import {createGame, previewGame} from '@/app/api/game-actions';
import {GAME_ROLES, GamePreview, GamePreviewWithGeneratedBots, GENDER_OPTIONS, getVoicesForGender, getRandomVoiceForGender, PLAY_STYLES, PLAY_STYLE_CONFIGS, UserTier, USER_TIERS} from "@/app/api/game-models";
import {LLM_CONSTANTS, SupportedAiModels} from "@/app/ai/ai-models";
import {FREE_TIER_UNLIMITED, getCandidateModelsForTier, getPerGameModelLimit} from "@/app/ai/model-limit-utils";
import MultiSelectDropdown from '@/app/components/MultiSelectDropdown';
import {ttsService} from "@/app/services/tts-service";
import {getVoiceConfig, getDefaultVoiceProvider, VOICE_PROVIDER_DISPLAY_NAMES} from "@/app/ai/voice-config";
import {VoiceProvider} from "@/app/ai/voice-config/voice-config";

export default function CreateNewGamePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // All hooks must be called before any conditional returns
    const [name, setName] = useState('');
    const [theme, setTheme] = useState('');
    const [description, setDescription] = useState('');
    const [playerCount, setPlayerCount] = useState(12);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState([GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE]);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [selectedPlayerAiTypes, setSelectedPlayerAiTypes] = useState<string[]>(Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM));
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<GamePreviewWithGeneratedBots | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showPlayStyleTooltip, setShowPlayStyleTooltip] = useState<number | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [themeError, setThemeError] = useState<string | null>(null);
    const [playersAiError, setPlayersAiError] = useState<string | null>(null);
    const [botNameErrors, setBotNameErrors] = useState<{[key: number]: string}>({});
    const [userTier, setUserTier] = useState<UserTier>('free');
    const [isTierLoaded, setIsTierLoaded] = useState(false);
    const hasInitializedPlayerModels = useRef(false);
    const playerOptions = useMemo(() => {
        const maxPlayers = userTier === USER_TIERS.API ? 16 : 12;
        return Array.from({ length: maxPlayers - 5 }, (_, i) => i + 6);
    }, [userTier]);
    const allModels = useMemo(() => Object.values(LLM_CONSTANTS), []);
    const candidateModels = useMemo(() => getCandidateModelsForTier(userTier), [userTier]);
    const gameMasterOptions = useMemo(() => {
        if (userTier === USER_TIERS.FREE) {
            return [LLM_CONSTANTS.RANDOM, ...candidateModels];
        }
        return allModels;
    }, [userTier, candidateModels, allModels]);
    const playerModelOptions = useMemo(() => {
        const base = userTier === USER_TIERS.FREE ? candidateModels : allModels;
        return base.filter(model => model !== LLM_CONSTANTS.RANDOM);
    }, [userTier, candidateModels, allModels]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/api/auth/signin');
        }
    }, [status, router]);

    useEffect(() => {
        if (status !== 'authenticated' || isTierLoaded) {
            return;
        }

        let cancelled = false;

        const loadTier = async () => {
            try {
                const response = await fetch('/api/user-tier');
                if (!cancelled && response?.ok) {
                    const data = await response.json();
                    setUserTier(data.tier as UserTier);
                }
            } catch (err) {
                console.error('Failed to load user tier for model selection', err);
                // Fallback to existing default (free) if we cannot load the tier
            } finally {
                if (!cancelled) {
                    setIsTierLoaded(true);
                }
            }
        };

        loadTier();

        return () => {
            cancelled = true;
        };
    }, [status, isTierLoaded]);

    useEffect(() => {
        if (werewolfCount >= playerCount) {
            setWerewolfCount(playerCount - 1);
        }
    }, [playerCount, werewolfCount]);

    useEffect(() => {
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

        // Helper function to validate theme
        const validateTheme = (theme: string): string | null => {
            if (!theme.trim()) {
                return "Theme cannot be empty";
            }
            return null;
        };

        const nameValidationError = validateName(name);
        setNameError(nameValidationError);

        const themeValidationError = validateTheme(theme);
        setThemeError(themeValidationError);

        let playersAiValidationError = selectedPlayerAiTypes.length === 0 ? 'At least one AI model must be selected' : null;

        if (!playersAiValidationError && userTier === USER_TIERS.FREE) {
            const requiredBots = Math.max(0, playerCount - 1);
            const totalCapacity = selectedPlayerAiTypes.reduce<number>((total, model) => {
                if (total === FREE_TIER_UNLIMITED) {
                    return total;
                }

                try {
                    const limit = getPerGameModelLimit(model, 'free');
                    if (limit === FREE_TIER_UNLIMITED) {
                        return FREE_TIER_UNLIMITED;
                    }
                    return total + limit;
                } catch (err) {
                    console.warn('Unable to evaluate free tier capacity for model', model, err);
                    return total;
                }
            }, 0);

            if (totalCapacity !== FREE_TIER_UNLIMITED && totalCapacity < requiredBots) {
                const capacityLabel = totalCapacity === 1 ? '1 bot' : `${totalCapacity} bots`;
                const requiredLabel = requiredBots === 1 ? '1 bot' : `${requiredBots} bots`;
                playersAiValidationError = `Selected models can cover only ${capacityLabel} on the free tier. Add more models to cover ${requiredLabel}.`;
            }
        }

        setPlayersAiError(playersAiValidationError);

        setIsFormValid(
            name.trim() !== '' &&
            theme.trim() !== '' &&
            selectedPlayerAiTypes.length > 0 &&
            !nameValidationError &&
            !themeValidationError &&
            !playersAiValidationError
        );
    }, [name, theme, selectedPlayerAiTypes, userTier, playerCount]);

    useEffect(() => {
        if (gameData && !gameData.gameMasterVoice) {
            setGameData({ ...gameData, gameMasterVoice: getRandomVoiceForGender('male') });
        }
    }, [gameData]);

    useEffect(() => {
        if (!isTierLoaded) {
            return;
        }

        setGameMasterAiType(prev => {
            if (prev === LLM_CONSTANTS.RANDOM || gameMasterOptions.includes(prev)) {
                return prev;
            }
            return gameMasterOptions[0] ?? LLM_CONSTANTS.RANDOM;
        });
    }, [isTierLoaded, gameMasterOptions]);

    useEffect(() => {
        if (!isTierLoaded) {
            return;
        }

        setSelectedPlayerAiTypes(prev => {
            const filtered = prev.filter(model => playerModelOptions.includes(model));

            if (!hasInitializedPlayerModels.current) {
                hasInitializedPlayerModels.current = true;
                if (filtered.length > 0) {
                    return filtered;
                }
                return playerModelOptions;
            }

            if (filtered.length !== prev.length) {
                return filtered;
            }

            return prev;
        });
    }, [isTierLoaded, playerModelOptions]);

    // Show loading while checking auth
    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-white text-xl">Loading...</div>
            </div>
        );
    }

    // Don't render if not authenticated
    if (!session) {
        return null;
    }


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

    // Helper function to validate theme
    const validateTheme = (theme: string): string | null => {
        if (!theme.trim()) {
            return "Theme cannot be empty";
        }
        return null;
    };

    const availableRoles = [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE];


    const handleGeneratePreview = async () => {
        const gamePreviewData: GamePreview = {
            name,
            theme,
            description,
            playerCount,
            werewolfCount,
            specialRoles,
            gameMasterAiType,
            playersAiType: selectedPlayerAiTypes.length > 0 ? selectedPlayerAiTypes : [LLM_CONSTANTS.RANDOM]
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

    const handlePlayStory = async (story: string, voice: string, voiceStyle?: string) => {
        try {
            setIsSpeaking(true);
            const voiceProvider = gameData?.voiceProvider || getDefaultVoiceProvider();
            await ttsService.speakText(story, {
                voice: voice,
                voiceStyle: voiceStyle,
                voiceProvider: voiceProvider
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
                            placeholder="Name *"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
                    </div>
                    <div className="w-1/2">
                        <input
                            className={`w-full p-2 rounded bg-black bg-opacity-30 text-white border ${themeError ? 'border-red-500' : 'border-white border-opacity-30'} focus:outline-none focus:border-white focus:border-opacity-50`}
                            type="text"
                            placeholder="Theme *"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            required
                        />
                        {themeError && <p className="text-red-500 text-sm mt-1">{themeError}</p>}
                    </div>
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
                            disabled={!isTierLoaded}
                        >
                            {gameMasterOptions.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 sm:flex-1">
                        <label className={labelStyle}>Players AI *:</label>
                        <div className="w-full sm:flex-1">
                            <MultiSelectDropdown
                                options={playerModelOptions}
                                selectedOptions={selectedPlayerAiTypes}
                                onChange={setSelectedPlayerAiTypes}
                                placeholder="Select AI models for bots... *"
                                className="w-full"
                                hasError={!!playersAiError}
                                disabled={!isTierLoaded}
                            />
                            {playersAiError && <p className="text-red-500 text-sm mt-1">{playersAiError}</p>}
                        </div>
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
                            {/* Voice Provider indicator */}
                            <div className="mb-2 text-sm text-gray-400">
                                Voice Provider: <span className="text-white font-medium">{VOICE_PROVIDER_DISPLAY_NAMES[gameData.voiceProvider] || gameData.voiceProvider}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-sm mb-1">AI Model:</label>
                                    <select
                                        className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={gameData.gameMasterAiType}
                                        onChange={(e) => handleGameMasterAiChange(e.target.value)}
                                    >
                                        {gameMasterOptions.filter(model => model !== LLM_CONSTANTS.RANDOM).map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-gray-400 text-sm mb-1">Voice:</label>
                                        <select
                                            className="w-full h-10 p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                            value={gameData.gameMasterVoice || getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male')[0]?.id}
                                            onChange={(e) => setGameData({ ...gameData, gameMasterVoice: e.target.value })}
                                        >
                                            {getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male').map(voice => (
                                                <option key={voice.id} value={voice.id}>{voice.id}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <button
                                            className={`w-10 h-10 ${buttonTransparentStyle} ${(!gameData.scene || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
                                            onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gameData.gameMasterVoice || getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male')[0]?.id || '', gameData.gameMasterVoiceStyle)}
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
                            {gameData.gameMasterVoiceStyle && (
                                <div className="mt-2">
                                    <label className="block text-gray-400 text-sm mb-1">Voice Style:</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={gameData.gameMasterVoiceStyle}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterVoiceStyle: e.target.value })}
                                        placeholder="Voice style (e.g., authoritatively, dramatically)"
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
                                                {getVoiceConfig(gameData.voiceProvider).getVoicesByGender(player.gender).map(voice => (
                                                    <option key={voice.id} value={voice.id}>{voice.id}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col justify-end">
                                            <button
                                                className={`w-10 h-10 ${buttonTransparentStyle} ${(!player.story || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
                                                onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(player.story, player.voice, player.voiceStyle)}
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
                                        {playerModelOptions.map(model => (
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
                            {player.voiceStyle && (
                                <div className="mt-2">
                                    <label className="block text-gray-400 text-sm mb-1">Voice Style:</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                                        value={player.voiceStyle}
                                        onChange={(e) => handlePlayerChange(index, 'voiceStyle', e.target.value)}
                                        placeholder="Voice style (e.g., mysteriously, excitedly)"
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
