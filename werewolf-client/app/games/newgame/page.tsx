'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {createGame, previewGame} from '@/app/api/game-actions';
import {GAME_ROLES, GamePreview, GamePreviewWithGeneratedBots, GENDER_OPTIONS, getVoicesForGender, getRandomVoiceForGender, PLAY_STYLES, PLAY_STYLE_CONFIGS, UserTier, USER_TIERS} from "@/app/api/game-models";
import {LLM_CONSTANTS, SupportedAiModels, getModelDisplayName} from "@/app/ai/ai-models";
import {FREE_TIER_UNLIMITED, getCandidateModelsForTier, getPerGameModelLimit} from "@/app/ai/model-limit-utils";
import MultiSelectDropdown from '@/app/components/MultiSelectDropdown';
import ModelSelectDropdown from '@/app/components/ModelSelectDropdown';
import {ttsService} from "@/app/services/tts-service";
import {getVoiceConfig, getDefaultVoiceProvider, VOICE_PROVIDER_DISPLAY_NAMES} from "@/app/ai/voice-config";
import {VoiceProvider} from "@/app/ai/voice-config/voice-config";

const RANDOM_NAMES = ['Bob', 'John', 'Alex', 'Sam', 'Max', 'Leo', 'Kai', 'Finn'];
const RANDOM_THEMES = ['Lord of the Rings', 'Harry Potter', 'Hunger Games', 'Star Wars'];

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export default function CreateNewGamePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // All hooks must be called before any conditional returns
    const [name, setName] = useState(() => pickRandom(RANDOM_NAMES));
    const [theme, setTheme] = useState(() => pickRandom(RANDOM_THEMES));
    const [description, setDescription] = useState('');
    const [playerCount, setPlayerCount] = useState(12);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState([GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC]);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(LLM_CONSTANTS.RANDOM);
    const [selectedPlayerAiTypes, setSelectedPlayerAiTypes] = useState<string[]>(Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM));
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<GamePreviewWithGeneratedBots | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showPlayStyleTooltip, setShowPlayStyleTooltip] = useState<number | null>(null);
    const [showRoleTooltip, setShowRoleTooltip] = useState<string | null>(null);
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
    // GM is always RANDOM before preview generation; user changes it in the preview section
    const playerModelOptions = useMemo(() => {
        // For free tier, show ALL models (available ones selectable, unavailable greyed out)
        const base = allModels;
        return base.filter(model => model !== LLM_CONSTANTS.RANDOM);
    }, [allModels]);

    // For the multi-select: provide meta (disabled + counter suffix) for each model option
    const playerModelOptionMeta = useMemo(() => {
        if (userTier !== USER_TIERS.FREE) return undefined;
        return (model: string) => {
            const config = SupportedAiModels[model];
            if (!config?.freeTier?.available || config.freeTier.maxBotsPerGame === 0) {
                return { disabled: true, suffix: '(not available)' };
            }
            const limit = config.freeTier.maxBotsPerGame;
            if (limit === -1) {
                return { suffix: '(unlimited)' };
            }
            return { suffix: `(${limit}x per game)` };
        };
    }, [userTier]);

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

    // GM defaults to RANDOM, resolved during preview generation

    useEffect(() => {
        if (!isTierLoaded) {
            return;
        }

        // Only candidate (available) models should be auto-selected
        const availablePlayerModels = candidateModels.filter(m => m !== LLM_CONSTANTS.RANDOM);

        setSelectedPlayerAiTypes(prev => {
            const filtered = prev.filter(model => playerModelOptions.includes(model) && availablePlayerModels.includes(model));

            if (!hasInitializedPlayerModels.current) {
                hasInitializedPlayerModels.current = true;
                if (filtered.length > 0) {
                    return filtered;
                }
                return availablePlayerModels;
            }

            if (filtered.length !== prev.length) {
                return filtered;
            }

            return prev;
        });
    }, [isTierLoaded, playerModelOptions, candidateModels]);

    // Compute per-model usage counts from preview data (GM + all bots)
    const previewUsageCounts = useMemo(() => {
        if (!gameData) return {};
        const counts: Record<string, number> = {};
        const increment = (model?: string) => {
            if (!model) return;
            counts[model] = (counts[model] ?? 0) + 1;
        };
        increment(gameData.gameMasterAiType);
        for (const bot of gameData.bots) {
            increment(bot.playerAiType);
        }
        return counts;
    }, [gameData]);

    // Build option list with remaining capacity for preview model dropdowns
    const getPreviewModelOptions = useMemo(() => {
        if (userTier !== USER_TIERS.FREE) {
            // API tier: all models, no limits
            return (currentModel: string) =>
                playerModelOptions.map(model => {
                    const name = getModelDisplayName(model);
                    return { model, disabled: false, label: name, displayLabel: name };
                });
        }
        return (currentModel: string) => {
            return playerModelOptions
                .filter(model => {
                    const config = SupportedAiModels[model];
                    return model === currentModel || (config?.freeTier?.available && config.freeTier.maxBotsPerGame !== 0);
                })
                .map(model => {
                    const config = SupportedAiModels[model];
                    const limit = config?.freeTier?.maxBotsPerGame ?? 0;
                    const used = previewUsageCounts[model] ?? 0;
                    const displayLabel = getModelDisplayName(model);

                    if (limit === -1) {
                        return { model, disabled: false, label: `${displayLabel} (unlimited)`, displayLabel };
                    }

                    const adjustedUsed = model === currentModel ? Math.max(0, used - 1) : used;
                    const remaining = Math.max(0, limit - adjustedUsed);
                    const disabled = remaining === 0;
                    return { model, disabled, label: `${displayLabel} (${remaining} left)`, displayLabel };
                });
        };
    }, [userTier, playerModelOptions, previewUsageCounts]);

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

    const availableRoles = [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC];
    const roleTooltips: Record<string, string> = {
        [GAME_ROLES.DOCTOR]: 'Each night, protects one player from werewolf attacks. Cannot protect the same player two nights in a row. Has a one-time ability to kill instead of protect.',
        [GAME_ROLES.DETECTIVE]: 'Each night, investigates one player to learn if they are evil (werewolf or maniac) or innocent. Cannot investigate the same player twice. Has a one-time ability to kill a player instead of investigating.',
        [GAME_ROLES.MANIAC]: 'Each night, abducts one player — blocking all their actions and any actions targeting them. Abductions are secret. If the maniac dies at night, the abducted victim dies too. Aligned with villagers.',
    };


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

    // Common Ember styles
    const inputStyle = "chat-input w-full";
    const labelStyle = "pixel-text whitespace-nowrap w-full sm:w-36";
    const flexRowStyle = "flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4";
    const flexItemStyle = "flex-1 flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2";
    const buttonDisabledStyle = "opacity-40 cursor-not-allowed";
    const selectStyle = "chat-input w-full h-10";

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6" style={{ color: 'var(--ember-ink-0)' }}>
            <div className="flex justify-between items-center mb-6">
                <h1 className="pixel-text" style={{ fontSize: 16, color: 'var(--ember-fire-4)' }}>CREATE NEW GAME</h1>
                <div className={`${flexRowStyle} justify-end mb-4`}>
                    <button
                        className={`pbtn pbtn-primary ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                        onClick={handleGeneratePreview}
                        disabled={!isFormValid || isLoading}
                    >
                        {isLoading ? '▸ GENERATING...' : (gameData ? '▸ REGENERATE' : '▸ GENERATE PREVIEW')}
                    </button>
                    {gameData && (
                        <button
                            className={`pbtn pbtn-primary ${isLoading ? buttonDisabledStyle : ''}`}
                            onClick={handleCreateGame}
                            disabled={isLoading}
                        >
                            {isLoading ? '▸ CREATING...' : '▸ CREATE GAME'}
                        </button>
                    )}
                </div>
            </div>

            <form id="create-game-form" className="space-y-3">
                <div className="flex space-x-2">
                    <div className="w-1/2">
                        <input
                            className={`chat-input w-full ${nameError ? '!border-[var(--ember-blood-3)]' : ''}`}
                            type="text"
                            placeholder="Name *"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        {nameError && <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-blood-3)', marginTop: 4 }}>{nameError}</p>}
                    </div>
                    <div className="w-1/2">
                        <input
                            className={`chat-input w-full ${themeError ? '!border-[var(--ember-blood-3)]' : ''}`}
                            type="text"
                            placeholder="Theme *"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            required
                        />
                        {themeError && <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-blood-3)', marginTop: 4 }}>{themeError}</p>}
                    </div>
                </div>

                <textarea
                    className="chat-input w-full"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                />

                <div className={flexRowStyle}>
                    <div className={flexItemStyle}>
                        <label className={labelStyle} style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1 }}>PLAYER COUNT:</label>
                        <select className={selectStyle} value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))} required>
                            {playerOptions.map(count => (
                                <option key={count} value={count}>{count} players</option>
                            ))}
                        </select>
                    </div>
                    <div className={flexItemStyle}>
                        <label className={labelStyle} style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1 }}>WEREWOLF COUNT:</label>
                        <select className={selectStyle} value={werewolfCount} onChange={(e) => setWerewolfCount(Number(e.target.value))} required>
                            {Array.from({length: playerCount - 1}, (_, i) => (
                                <option key={i} value={i}>{i} werewolves</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                    <label className={labelStyle} style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1 }}>PLAYERS AI *:</label>
                    <div className="w-full sm:flex-1">
                        <MultiSelectDropdown
                            options={playerModelOptions}
                            selectedOptions={selectedPlayerAiTypes}
                            onChange={setSelectedPlayerAiTypes}
                            placeholder="Select AI models for bots... *"
                            className="w-full"
                            hasError={!!playersAiError}
                            disabled={!isTierLoaded}
                            labelFn={getModelDisplayName}
                            optionMetaFn={playerModelOptionMeta}
                        />
                        {playersAiError && <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-blood-3)', marginTop: 4 }}>{playersAiError}</p>}
                    </div>
                </div>


                <div className={flexRowStyle}>
                    <div className={flexItemStyle}>
                        <label className={labelStyle} style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1 }}>SPECIAL ROLES:</label>
                        <div className="flex gap-4">
                            {availableRoles.map(role => (
                                <div key={role} className="relative flex items-center">
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
                                    <label htmlFor={role} style={{ color: 'var(--ember-ink-1)', marginRight: 4 }}>
                                        {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </label>
                                    <button
                                        type="button"
                                        className="pixel-text"
                                        style={{ width: 18, height: 18, background: 'var(--ember-bg-3)', border: '1px solid var(--ember-border)', color: 'var(--ember-ink-2)', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        onMouseEnter={() => setShowRoleTooltip(role)}
                                        onMouseLeave={() => setShowRoleTooltip(null)}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setShowRoleTooltip(showRoleTooltip === role ? null : role);
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    {showRoleTooltip === role && (
                                        <div className="absolute z-10 w-64 p-3 top-full mt-2 left-0" style={{ background: 'var(--ember-bg-0)', border: '2px solid var(--ember-border)', boxShadow: '4px 4px 0 rgba(0,0,0,0.6)', fontSize: 13, color: 'var(--ember-ink-1)', fontFamily: 'var(--f-console)' }}>
                                            {roleTooltips[role]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </form>

            {isLoading && (
                <div className="panel-sm mt-4 p-4" style={{ borderColor: 'var(--ember-moon-1)' }}>
                    <div className="flex items-start space-x-2">
                        <span className="thinking"><span /><span /><span /></span>
                        <div>
                            <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-moon-2)', marginBottom: 4 }}>GENERATING PREVIEW...</h3>
                            <p className="console-text" style={{ fontSize: 13, color: 'var(--ember-ink-2)' }}>The AI is creating your game story and characters.</p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="panel-sm mt-4 p-4" style={{ borderColor: 'var(--ember-blood-3)' }}>
                    <div className="flex items-start space-x-2">
                        <span style={{ color: 'var(--ember-blood-3)', fontSize: 16 }}>⚠</span>
                        <div>
                            <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-blood-3)', marginBottom: 4 }}>GENERATION FAILED</h3>
                            <p className="console-text" style={{ fontSize: 13, color: 'var(--ember-ink-1)' }}>{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview section remains unchanged */}
            {gameData && (
                <div className="mt-8">
                    <div className="hr-pixel" />
                    <h2 className="pixel-text mb-6" style={{ fontSize: 14, color: 'var(--ember-fire-4)' }}>PREVIEW</h2>

                    <div className="mb-4">
                        <label htmlFor="gameStory" className="pixel-text block mb-2" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1 }}>GAME STORY:</label>
                        <textarea
                            id="gameStory"
                            className="chat-input w-full"
                            rows={5}
                            value={gameData.scene}
                            onChange={(e) => handleStoryChange(e.target.value)}
                        />
                    </div>

                    <div className="mb-6">
                        <h3 className="pixel-text mb-4" style={{ fontSize: 11, color: 'var(--ember-fire-4)' }}>GAME MASTER:</h3>
                        <div className="panel-sm p-4">
                            <div className="console-text mb-2" style={{ fontSize: 13, color: 'var(--ember-ink-3)' }}>
                                Voice Provider: <span className="text-white font-medium">{VOICE_PROVIDER_DISPLAY_NAMES[gameData.voiceProvider] || gameData.voiceProvider}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-2">
                                <div className="flex-1">
                                    <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>AI MODEL:</label>
                                    <ModelSelectDropdown
                                        options={getPreviewModelOptions(gameData.gameMasterAiType)}
                                        value={gameData.gameMasterAiType}
                                        onChange={(value) => handleGameMasterAiChange(value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex-1 flex gap-2">
                                    <div className="flex-1">
                                        <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>VOICE:</label>
                                        <select className={selectStyle}
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
                                            className={`pbtn pbtn-ghost ${(!gameData.scene || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            style={{ width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gameData.gameMasterVoice || getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male')[0]?.id || '', gameData.gameMasterVoiceStyle)}
                                            disabled={!gameData.scene}
                                            title={isSpeaking ? "Stop speaking" : "Play game story"}
                                        >
                                            {isSpeaking ? '⏹' : '🔊'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {gameData.gameMasterVoiceStyle && (
                                <div className="mt-2">
                                    <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>VOICE STYLE:</label>
                                    <input
                                        type="text"
                                        className="chat-input w-full"
                                        value={gameData.gameMasterVoiceStyle}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterVoiceStyle: e.target.value })}
                                        placeholder="Voice style (e.g., authoritatively, dramatically)"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <h3 className="pixel-text mb-4" style={{ fontSize: 11, color: 'var(--ember-fire-4)' }}>PLAYERS:</h3>
                    {gameData.bots.map((player, index) => (
                        <div key={index} className="panel-sm mb-4 p-4">
                            <div className="flex flex-col gap-2 mb-2">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex-1">
                                        <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>NAME:</label>
                                        <input
                                            type="text"
                                            className={`chat-input w-full h-10 ${botNameErrors[index] ? '!border-[var(--ember-blood-3)]' : ''}`}
                                            value={player.name}
                                            onChange={(e) => handlePlayerChange(index, 'name', e.target.value)}
                                            placeholder="Player Name"
                                        />
                                        {botNameErrors[index] && <p className="console-text" style={{ fontSize: 11, color: 'var(--ember-blood-3)', marginTop: 2 }}>{botNameErrors[index]}</p>}
                                    </div>
                                    <div className="flex-1">
                                        <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>GENDER:</label>
                                        <select className={selectStyle}
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
                                            <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>VOICE:</label>
                                            <select className={selectStyle}
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
                                                className={`pbtn pbtn-ghost ${(!player.story || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                style={{ width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(player.story, player.voice, player.voiceStyle)}
                                                disabled={!player.story}
                                                title={isSpeaking ? "Stop speaking" : "Play story"}
                                            >
                                                {isSpeaking ? '⏹' : '🔊'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 mb-2">
                                <div className="flex-1">
                                    <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>AI MODEL:</label>
                                    <ModelSelectDropdown
                                        options={getPreviewModelOptions(player.playerAiType)}
                                        value={player.playerAiType}
                                        onChange={(value) => handleBotAiChange(index, value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex-1 flex gap-2">
                                    <div className="flex-1">
                                        <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>PLAY STYLE:</label>
                                        <select className={selectStyle}
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
                                            className="pbtn pbtn-ghost"
                                            style={{ width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
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
                                            <div className="absolute z-10 w-64 sm:w-72 md:w-80 p-3 top-full mt-2 right-0" style={{ background: 'var(--ember-bg-0)', border: '2px solid var(--ember-border)', boxShadow: '4px 4px 0 rgba(0,0,0,0.6)' }}>
                                                <div className="pixel-text mb-2" style={{ fontSize: 9, color: 'var(--ember-fire-4)' }}>
                                                    {PLAY_STYLE_CONFIGS[player.playStyle]?.name || player.playStyle}
                                                </div>
                                                <div className="console-text" style={{ fontSize: 13, color: 'var(--ember-ink-1)' }}>
                                                    {PLAY_STYLE_CONFIGS[player.playStyle]?.uiDescription || 'No description available'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>STORY:</label>
                                <textarea
                                    className="chat-input w-full"
                                    rows={3}
                                    value={player.story}
                                    onChange={(e) => handlePlayerChange(index, 'story', e.target.value)}
                                    placeholder="Player's Story"
                                />
                            </div>
                            {player.voiceStyle && (
                                <div className="mt-2">
                                    <label className="pixel-text block mb-1" style={{ fontSize: 8, color: 'var(--ember-ink-3)', letterSpacing: 1 }}>VOICE STYLE:</label>
                                    <input
                                        type="text"
                                        className="chat-input w-full"
                                        value={player.voiceStyle}
                                        onChange={(e) => handlePlayerChange(index, 'voiceStyle', e.target.value)}
                                        placeholder="Voice style (e.g., mysteriously, excitedly)"
                                    />
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="hr-pixel" />
                    <div className="flex justify-end space-x-4 mt-4">
                        <button
                            className={`pbtn pbtn-ghost ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? '▸ GENERATING...' : '▸ REGENERATE'}
                        </button>
                        <button
                            className={`pbtn pbtn-primary ${isLoading ? buttonDisabledStyle : ''}`}
                            onClick={handleCreateGame}
                            disabled={isLoading}
                        >
                            {isLoading ? '▸ CREATING...' : '▸ CREATE GAME'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
