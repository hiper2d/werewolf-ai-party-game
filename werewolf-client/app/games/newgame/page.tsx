'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {createGame, previewGame} from '@/app/api/game-actions';
import {GAME_ROLES, GamePreview, GamePreviewWithGeneratedBots, GENDER_OPTIONS, getVoicesForGender, getRandomVoiceForGender, PLAY_STYLES, PLAY_STYLE_CONFIGS, UserTier, USER_TIERS} from "@/app/api/game-models";
import {LLM_CONSTANTS, SupportedAiModels, getModelDisplayName, modelHasTag} from "@/app/ai/ai-models";
import {FREE_TIER_UNLIMITED, getAvailableModelsForUser, getCandidateModelsForTier, getPerGameModelLimit} from "@/app/ai/model-limit-utils";
import AIModelSelect from '@/app/components/AIModelSelect';
import ModelSelectDropdown from '@/app/components/ModelSelectDropdown';
import SelectDropdown from '@/app/components/SelectDropdown';
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
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(() => {
        // Initial seed: random cheap/very-cheap model from the full catalog.
        // Tier/key data isn't loaded yet on first render — a reconciliation effect below
        // re-picks from the user's actually-allowed pool once that data is in.
        const cheap = Object.values(LLM_CONSTANTS).filter(
            m => m !== LLM_CONSTANTS.RANDOM && (modelHasTag(m, 'cheap') || modelHasTag(m, 'very-cheap'))
        );
        return cheap.length > 0 ? cheap[Math.floor(Math.random() * cheap.length)] : LLM_CONSTANTS.RANDOM;
    });
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
    const [fastModelsOnly, setFastModelsOnly] = useState(false);
    const [botNameErrors, setBotNameErrors] = useState<{[key: number]: string}>({});
    const [userTier, setUserTier] = useState<UserTier>('free');
    const [isTierLoaded, setIsTierLoaded] = useState(false);
    const [providedKeyNames, setProvidedKeyNames] = useState<Set<string>>(new Set());
    const [isKeysLoaded, setIsKeysLoaded] = useState(false);
    const hasInitializedPlayerModels = useRef(false);
    const playerOptions = useMemo(() => {
        const maxPlayers = userTier === USER_TIERS.API ? 16 : 12;
        return Array.from({ length: maxPlayers - 5 }, (_, i) => i + 6);
    }, [userTier]);
    const allModels = useMemo(() => Object.values(LLM_CONSTANTS), []);
    const candidateModels = useMemo(() => getCandidateModelsForTier(userTier), [userTier]);
    const FAST_MODELS = useMemo(() => new Set(
        Object.values(LLM_CONSTANTS).filter(m => modelHasTag(m, 'fast'))
    ), []);
    // For API tier, restrict to models the user has provided keys for.
    const apiTierAllowed = useMemo(() => {
        if (userTier !== USER_TIERS.API) return null;
        return new Set(allModels.filter(modelId => {
            const config = SupportedAiModels[modelId];
            return !!config && providedKeyNames.has(config.apiKeyName);
        }));
    }, [userTier, allModels, providedKeyNames]);

    const gmModelOptions = useMemo(() => {
        return allModels.filter(model => model !== LLM_CONSTANTS.RANDOM)
            .filter(model => apiTierAllowed ? apiTierAllowed.has(model) : true)
            .map(model => {
                const name = getModelDisplayName(model);
                return { model, disabled: false, label: name, displayLabel: name };
            });
    }, [allModels, apiTierAllowed]);

    const playerModelOptions = useMemo(() => {
        // For free tier, show ALL models (available ones selectable, unavailable greyed out)
        // For API tier, only show models whose keys the user has provided.
        const base = apiTierAllowed
            ? allModels.filter(model => apiTierAllowed.has(model))
            : allModels;
        return base.filter(model => model !== LLM_CONSTANTS.RANDOM);
    }, [allModels, apiTierAllowed]);

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
        if (status !== 'authenticated' || isKeysLoaded) {
            return;
        }
        let cancelled = false;
        const loadKeys = async () => {
            try {
                const response = await fetch('/api/user-key-names');
                if (!cancelled && response?.ok) {
                    const data = await response.json();
                    if (Array.isArray(data?.providedKeys)) {
                        setProvidedKeyNames(new Set(data.providedKeys as string[]));
                    }
                }
            } catch (err) {
                console.error('Failed to load user API key names for model selection', err);
            } finally {
                if (!cancelled) {
                    setIsKeysLoaded(true);
                }
            }
        };
        loadKeys();
        return () => {
            cancelled = true;
        };
    }, [status, isKeysLoaded]);

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
        if (!isTierLoaded || (userTier === USER_TIERS.API && !isKeysLoaded)) {
            return;
        }

        // Only candidate (available) models should be auto-selected
        const availablePlayerModels = candidateModels.filter(m => m !== LLM_CONSTANTS.RANDOM);
        // Gated set actually shown in the UI (API-tier-aware).
        const visiblePlayerModels = playerModelOptions;

        setSelectedPlayerAiTypes(prev => {
            const filtered = prev.filter(model => visiblePlayerModels.includes(model) && availablePlayerModels.includes(model));

            if (!hasInitializedPlayerModels.current) {
                hasInitializedPlayerModels.current = true;
                if (filtered.length > 0) {
                    return filtered;
                }
                // Fall back to whatever is actually visible — not the full candidate set,
                // which may include models the API-tier user has no key for.
                return visiblePlayerModels;
            }

            if (filtered.length !== prev.length) {
                return filtered;
            }

            return prev;
        });
    }, [isTierLoaded, isKeysLoaded, userTier, playerModelOptions, candidateModels]);

    // If the auto-picked GM model isn't allowed for the current tier+keys, re-pick from
    // the user's actually-allowed cheap/very-cheap models (random), regardless of tier.
    useEffect(() => {
        if (!isTierLoaded) return;
        if (userTier === USER_TIERS.API && !isKeysLoaded) return;
        if (gameMasterAiType === LLM_CONSTANTS.RANDOM) return;

        // Build the allowed-for-this-user set.
        let allowed: Set<string>;
        if (userTier === USER_TIERS.API) {
            if (!apiTierAllowed) return;
            allowed = apiTierAllowed;
        } else if (userTier === USER_TIERS.FREE) {
            allowed = new Set(candidateModels);
        } else {
            allowed = new Set(allModels);
        }

        if (allowed.has(gameMasterAiType)) return;

        // Re-pick: prefer cheap / very-cheap from the allowed set; if none, any allowed model.
        const allowedArr = Array.from(allowed).filter(m => m !== LLM_CONSTANTS.RANDOM);
        const cheapAllowed = allowedArr.filter(
            m => modelHasTag(m, 'cheap') || modelHasTag(m, 'very-cheap')
        );
        const pool = cheapAllowed.length > 0 ? cheapAllowed : allowedArr;
        const replacement = pool.length > 0
            ? pool[Math.floor(Math.random() * pool.length)]
            : LLM_CONSTANTS.RANDOM;
        setGameMasterAiType(replacement);
    }, [isTierLoaded, isKeysLoaded, userTier, apiTierAllowed, candidateModels, allModels, gameMasterAiType]);

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

            // Transliterate non-ASCII characters so old previews don't trip the validator.
            const sanitizeName = (raw: string): string => {
                // Strip combining marks after NFKD decomposition, then drop anything non-ASCII-alphanumeric.
                const cleaned = raw.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]/g, '');
                return cleaned || raw;
            };

            // Set all thinking modes to false by default
            const updatedGame: GamePreviewWithGeneratedBots = {
                ...game,
                gameMasterThinking: false,
                bots: game.bots.map(bot => ({
                    ...bot,
                    name: sanitizeName(bot.name),
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
            const newGameId = await createGame(gameData);
            if (newGameId) {
                router.push(`/games/${newGameId}`);
            } else {
                router.push("/games");
            }
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
    const inputStyle = "w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-0)] text-[13px] placeholder:text-[var(--fg-3)] focus:outline-none focus:border-[var(--accent-line)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-[120ms]";
    const labelStyle = "text-[12px] font-medium text-[var(--fg-1)] whitespace-nowrap";
    const flexRowStyle = "flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4";
    const flexItemStyle = "flex-1 flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2";
    const buttonDisabledStyle = "opacity-50 cursor-not-allowed";

    return (
        <div className="flex flex-col w-full h-full max-w-[1040px] mx-auto pt-6 sm:pt-10">
            {/* Card */}
            <div className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] shadow-card">
                {/* Card header */}
                <div className="flex items-center justify-between px-5 sm:px-7 py-5 border-b border-[var(--line-1)]">
                    <h1 className="text-lg font-semibold text-[var(--fg-0)]">Create New Game</h1>
                    <div className="flex gap-2">
                        <button
                            className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms] ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin">&#9203;</span>
                                    <span>Generating...</span>
                                </span>
                            ) : (gameData ? 'Regenerate Preview' : 'Generate Preview')}
                        </button>
                        {gameData && (
                            <button
                                className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 transition-all duration-[120ms] ${isLoading ? buttonDisabledStyle : ''}`}
                                onClick={handleCreateGame}
                                disabled={isLoading}
                            >
                                {isLoading ? 'Processing...' : 'Create Game'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Card body */}
                <div className="px-5 sm:px-7 py-6">

            <form id="create-game-form" className="space-y-4">
                {/* Row 1: Name + Theme */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={`${labelStyle} block mb-1.5`}>Host Name</label>
                        <input
                            className={`${inputStyle} ${nameError ? '!border-[var(--danger)]' : ''}`}
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                        {nameError && <p className="text-[var(--danger)] text-[12px] mt-1">{nameError}</p>}
                    </div>
                    <div>
                        <label className={`${labelStyle} block mb-1.5`}>Game Title</label>
                        <input
                            className={`${inputStyle} ${themeError ? '!border-[var(--danger)]' : ''}`}
                            type="text"
                            placeholder="Theme or setting"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            required
                        />
                        {themeError && <p className="text-[var(--danger)] text-[12px] mt-1">{themeError}</p>}
                    </div>
                </div>

                {/* Row 2: Description */}
                <div>
                    <label className={`${labelStyle} block mb-1.5`}>Description <span className="text-[var(--fg-3)] font-normal">(optional)</span></label>
                    <textarea
                        className={`${inputStyle} min-h-[76px] resize-y`}
                        placeholder="Describe the setting for your game..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                    />
                </div>

                {/* Row 3: Counts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <label className={labelStyle}>Player Count</label>
                        <SelectDropdown
                            options={playerOptions.map(count => ({ value: String(count), label: `${count} players` }))}
                            value={String(playerCount)}
                            onChange={(val) => setPlayerCount(Number(val))}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <label className={labelStyle}>Werewolf Count</label>
                        <SelectDropdown
                            options={Array.from({length: playerCount - 1}, (_, i) => ({ value: String(i), label: `${i} werewolves` }))}
                            value={String(werewolfCount)}
                            onChange={(val) => setWerewolfCount(Number(val))}
                        />
                    </div>
                </div>

                {/* Row 3.5: Game Master AI */}
                <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                    <label className={labelStyle}>Game Master</label>
                    <ModelSelectDropdown
                        options={gmModelOptions}
                        value={gameMasterAiType}
                        onChange={setGameMasterAiType}
                    />
                </div>

                {/* Row 4: Players AI */}
                <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                    <label className={`${labelStyle} pt-2.5`}>Players AI</label>
                    <div>
                        <AIModelSelect
                            options={playerModelOptions}
                            selectedOptions={selectedPlayerAiTypes}
                            onChange={setSelectedPlayerAiTypes}
                            placeholder="Select AI models for bots..."
                            className="w-full"
                            hasError={!!playersAiError}
                            disabled={!isTierLoaded}
                            optionMetaFn={playerModelOptionMeta}
                            onFastOnlyChange={setFastModelsOnly}
                        />
                        {playersAiError && <p className="text-[var(--danger)] text-[12px] mt-1">{playersAiError}</p>}
                    </div>
                </div>


                {/* Row 5: Special Roles */}
                <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                    <label className={`${labelStyle} pt-2`}>Special Roles</label>
                    <div className="flex flex-wrap gap-2">
                        {availableRoles.map(role => {
                            const isSelected = specialRoles.includes(role);
                            const roleGlyphs: Record<string, React.ReactNode> = {
                                doctor: (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M7 3v8M3 7h8" />
                                    </svg>
                                ),
                                detective: (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="5.5" cy="5.5" r="3.5" />
                                        <path d="M8.5 8.5L12.5 12.5" />
                                    </svg>
                                ),
                                maniac: (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M7 2L12 12H2L7 2Z" />
                                    </svg>
                                ),
                            };
                            return (
                                <div key={role} className="relative">
                                    <button
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            if (isSelected) {
                                                setSpecialRoles(specialRoles.filter(r => r !== role));
                                            } else {
                                                setSpecialRoles([...specialRoles, role]);
                                            }
                                        }}
                                        onMouseEnter={() => setShowRoleTooltip(role)}
                                        onMouseLeave={() => setShowRoleTooltip(null)}
                                        className={`flex items-center gap-2 px-3 py-[7px] rounded-[var(--radius-md)] border text-[13px] font-medium transition-all duration-[120ms] ${
                                            isSelected
                                                ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                                                : 'bg-[var(--bg-2)] border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-3)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)]'
                                        }`}
                                    >
                                        {/* Icon container */}
                                        <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                                            isSelected ? 'bg-[var(--accent-line)]' : 'bg-[var(--bg-3)]'
                                        }`}>
                                            {roleGlyphs[role]}
                                        </span>
                                        {role.charAt(0).toUpperCase() + role.slice(1)}
                                        {/* Trailing check */}
                                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all duration-[120ms] ${
                                            isSelected
                                                ? 'bg-[var(--accent)] border-[var(--accent)]'
                                                : 'bg-transparent border-[var(--line-2)]'
                                        }`}>
                                            {isSelected && (
                                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M1.5 4.5L3 6L6.5 2" />
                                                </svg>
                                            )}
                                        </span>
                                    </button>
                                    {showRoleTooltip === role && (
                                        <div className="absolute z-10 w-64 p-3 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop text-[13px] text-[var(--fg-1)] top-full mt-2 left-0">
                                            {roleTooltips[role]}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </form>

                </div>{/* end card body */}
            </div>{/* end card */}

            {isLoading && (
                <div className="mt-6 p-4 bg-[var(--accent-soft)] border border-[var(--accent-line)] rounded-[var(--radius-lg)]">
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-[var(--accent)] animate-spin flex-none" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M10 2a8 8 0 0 1 8 8" />
                        </svg>
                        <div>
                            <h3 className="text-[14px] font-semibold text-[var(--fg-0)] mb-0.5">Generating Game Preview<span className="inline-block w-6 text-left animate-pulse">...</span></h3>
                            <p className="text-[13px] text-[var(--fg-1)]">The AI is creating your game story and characters. This may take a moment.</p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-6 p-4 bg-[oklch(70%_0.13_25_/_0.08)] border border-[oklch(70%_0.13_25_/_0.3)] rounded-[var(--radius-lg)]">
                    <div className="flex items-start gap-2">
                        <span className="text-[var(--danger)] text-lg flex-none">&#9888;</span>
                        <div>
                            <h3 className="text-[var(--danger)] font-semibold text-[14px] mb-1">Game Preview Generation Failed</h3>
                            <p className="text-[var(--fg-1)] text-[13px]">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview section */}
            {gameData && (
                <div className="mt-8 space-y-6">
                    <h2 className="text-[20px] font-semibold text-[var(--fg-0)] tracking-[-0.01em]">Preview</h2>

                    {/* Game Story */}
                    <div>
                        <label htmlFor="gameStory" className={`${labelStyle} block mb-1.5`}>Game Story</label>
                        <textarea
                            id="gameStory"
                            className={`${inputStyle} min-h-[130px] resize-y`}
                            rows={5}
                            value={gameData.scene}
                            onChange={(e) => handleStoryChange(e.target.value)}
                        />
                    </div>

                    {/* Game Master */}
                    <div>
                        <h3 className="text-[15px] font-semibold text-[var(--fg-0)] mb-3 flex items-center gap-3 after:content-[''] after:flex-1 after:h-px after:bg-[var(--line-1)]">Game Master</h3>
                        <div className="p-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] space-y-3">
                            {/* Voice Provider meta */}
                            <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--fg-2)]">
                                Voice Provider <span className="text-[13px] font-sans font-semibold normal-case tracking-normal text-[var(--fg-0)] ml-1">{VOICE_PROVIDER_DISPLAY_NAMES[gameData.voiceProvider] || gameData.voiceProvider}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={`${labelStyle} block mb-1.5`}>AI Model</label>
                                    <ModelSelectDropdown
                                        options={getPreviewModelOptions(gameData.gameMasterAiType)}
                                        value={gameData.gameMasterAiType}
                                        onChange={(value) => handleGameMasterAiChange(value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className={`${labelStyle} block mb-1.5`}>Voice</label>
                                        <SelectDropdown
                                            options={getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male').map(voice => ({ value: voice.id, label: voice.id }))}
                                            value={gameData.gameMasterVoice || getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male')[0]?.id || ''}
                                            onChange={(val) => setGameData({ ...gameData, gameMasterVoice: val })}
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <button
                                            className={`w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] transition-all duration-[120ms] flex items-center justify-center ${(!gameData.scene || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gameData.gameMasterVoice || getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male')[0]?.id || '', gameData.gameMasterVoiceStyle)}
                                            disabled={!gameData.scene}
                                            title={isSpeaking ? "Stop speaking" : "Play game story"}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d={isSpeaking ? "M3 3h8v8H3z" : "M4 2.5l8 4.5-8 4.5z"} /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {gameData.gameMasterVoiceStyle && (
                                <div>
                                    <label className={`${labelStyle} block mb-1.5`}>Voice Style</label>
                                    <input
                                        type="text"
                                        className={inputStyle}
                                        value={gameData.gameMasterVoiceStyle}
                                        onChange={(e) => setGameData({ ...gameData, gameMasterVoiceStyle: e.target.value })}
                                        placeholder="Voice style (e.g., authoritatively, dramatically)"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Players */}
                    <div>
                        <h3 className="text-[15px] font-semibold text-[var(--fg-0)] mb-3 flex items-center gap-3 after:content-[''] after:flex-1 after:h-px after:bg-[var(--line-1)]">
                            Players <span className="text-[var(--fg-2)] font-normal">&middot; {gameData.bots.length} of {playerCount}</span>
                        </h3>
                        <div className="space-y-3">
                        {gameData.bots.map((player, index) => (
                            <div key={index} className="p-4 bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] space-y-3">
                                {/* Player head row */}
                                <div className="flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className="w-9 h-9 rounded-full bg-[var(--bg-3)] text-[var(--fg-1)] flex items-center justify-center text-[14px] font-semibold">
                                        {player.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <input
                                            type="text"
                                            className={`text-[14px] font-semibold text-[var(--fg-0)] bg-transparent border-none p-0 focus:outline-none w-full ${botNameErrors[index] ? 'text-[var(--danger)]' : ''}`}
                                            value={player.name}
                                            onChange={(e) => handlePlayerChange(index, 'name', e.target.value)}
                                            placeholder="Player Name"
                                        />
                                        {botNameErrors[index] && <p className="text-[var(--danger)] text-[11px]">{botNameErrors[index]}</p>}
                                        <div className="text-[11px] font-mono text-[var(--fg-2)]">
                                            {player.gender} &middot; {player.voice}
                                        </div>
                                    </div>
                                </div>

                                {/* AI Model + Play Style */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className={`${labelStyle} block mb-1.5`}>AI Model</label>
                                        <ModelSelectDropdown
                                            options={getPreviewModelOptions(player.playerAiType)}
                                            value={player.playerAiType}
                                            onChange={(value) => handleBotAiChange(index, value)}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className={`${labelStyle} block mb-1.5`}>Play Style</label>
                                            <SelectDropdown
                                                options={Object.values(PLAY_STYLES).map(style => ({
                                                    value: style,
                                                    label: style.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                                                }))}
                                                value={player.playStyle}
                                                onChange={(val) => handlePlayerChange(index, 'playStyle', val)}
                                            />
                                        </div>
                                        <div className="relative flex flex-col justify-end">
                                            <button
                                                type="button"
                                                className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-2)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] transition-all duration-[120ms] flex items-center justify-center text-[12px] font-medium"
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
                                                <div className="absolute z-10 w-64 sm:w-72 md:w-80 p-3 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop text-[13px] top-full mt-2 right-0">
                                                    <div className="font-semibold text-[var(--fg-0)] mb-1">
                                                        {PLAY_STYLE_CONFIGS[player.playStyle]?.name || player.playStyle}
                                                    </div>
                                                    <div className="text-[var(--fg-1)]">
                                                        {PLAY_STYLE_CONFIGS[player.playStyle]?.uiDescription || 'No description available'}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Story */}
                                <div>
                                    <label className={`${labelStyle} block mb-1.5`}>Story</label>
                                    <textarea
                                        className={`${inputStyle} min-h-[70px] resize-y`}
                                        rows={3}
                                        value={player.story}
                                        onChange={(e) => handlePlayerChange(index, 'story', e.target.value)}
                                        placeholder="Player's story"
                                    />
                                </div>

                                {/* Voice Style + Voice */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {player.voiceStyle !== undefined && (
                                        <div>
                                            <label className={`${labelStyle} block mb-1.5`}>Voice Style</label>
                                            <input
                                                type="text"
                                                className={inputStyle}
                                                value={player.voiceStyle}
                                                onChange={(e) => handlePlayerChange(index, 'voiceStyle', e.target.value)}
                                                placeholder="e.g., mysteriously, excitedly"
                                            />
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className={`${labelStyle} block mb-1.5`}>Voice</label>
                                            <SelectDropdown
                                                options={getVoiceConfig(gameData.voiceProvider).getVoicesByGender(player.gender).map(voice => ({ value: voice.id, label: voice.id }))}
                                                value={player.voice}
                                                onChange={(val) => handlePlayerChange(index, 'voice', val)}
                                            />
                                        </div>
                                        <div className="flex flex-col justify-end">
                                            <button
                                                className={`w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] transition-all duration-[120ms] flex items-center justify-center ${(!player.story || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(player.story, player.voice, player.voiceStyle)}
                                                disabled={!player.story}
                                                title={isSpeaking ? "Stop speaking" : "Play story"}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d={isSpeaking ? "M3 3h8v8H3z" : "M4 2.5l8 4.5-8 4.5z"} /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>

                    {/* Bottom actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms] ${(!isFormValid || isLoading) ? buttonDisabledStyle : ''}`}
                            onClick={handleGeneratePreview}
                            disabled={!isFormValid || isLoading}
                        >
                            {isLoading ? 'Generating...' : 'Regenerate Preview'}
                        </button>
                        <button
                            className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 transition-all duration-[120ms] ${isLoading ? buttonDisabledStyle : ''}`}
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
