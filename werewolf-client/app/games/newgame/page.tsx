'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {createGame, getPreviewProgress, previewGame} from '@/app/api/game-actions';
import {generateDraftIllustrations, getAvatarDraft, reframeDraftAvatar} from '@/app/api/avatar-draft-actions';
import type {PreviewProgress} from '@/app/ai/preview-generation';
import {AVATAR_DRAFT_IN_PROGRESS, AVATAR_GM_KEY, AvatarDraftState, AvatarFraming, avatarSheetKey, DEFAULT_GAME_MODE, GAME_MODES, GAME_ROLES, GameMode, GamePreview, GamePreviewWithGeneratedBots, getRandomVoiceForGender, RANDOM_ROLE, UserTier, USER_TIERS} from "@/app/api/game-models";
import {sanitizePlayerName} from "@/app/utils/name-utils";
import {circleFocus} from "@/app/utils/avatar-framing";
import IllustrationsPanel, {CastEntry, draftFraming, draftImageUrl} from '@/app/games/newgame/components/IllustrationsPanel';
import CastList, {RowPortrait} from '@/app/games/newgame/components/CastList';
import GeneratingStatus from '@/app/games/newgame/components/GeneratingStatus';
import {iconButton, InfoButton, inputStyle, labelStyle, monoLabel, monoMeta, PlayIcon, primaryButton, secondaryButton, SegmentedControl} from '@/app/games/newgame/components/form-ui';
import ReframeModal from '@/app/components/ReframeModal';
import {LLM_CONSTANTS, SupportedAiModels, getModelDisplayName, modelHasTag, modelIsFast} from "@/app/ai/ai-models";
import {FREE_TIER_UNLIMITED, getCandidateModelsForTier, getModelPickerOptions, getPerGameModelLimit} from "@/app/ai/model-limit-utils";
import AIModelSelect from '@/app/components/AIModelSelect';
import ModelSelectDropdown from '@/app/components/ModelSelectDropdown';
import SelectDropdown from '@/app/components/SelectDropdown';
import {ART_STYLE_MAX_LENGTH} from "@/app/utils/art-style";
import {ttsService} from "@/app/services/tts-service";
import {getVoiceConfig, getDefaultVoiceProvider, VOICE_PROVIDER_DISPLAY_NAMES} from "@/app/ai/voice-config";

const RANDOM_NAMES = ['Bob', 'John', 'Alex', 'Sam', 'Max', 'Leo', 'Kai', 'Finn'];
const RANDOM_THEMES = ['Dracula', 'Sherlock Holmes', 'Cthulhu Mythos', 'Treasure Island', 'Spaceship Crew', 'Wild West Town'];

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Default GM pick: the GM narrates every turn, so speed matters most.
// Prefer fast+cheap, then any fast, then whatever the pool allows.
function pickDefaultGmModel(pool: string[]): string {
    const fastCheap = pool.filter(m => modelIsFast(m) && modelHasTag(m, 'cheap'));
    const fast = fastCheap.length > 0 ? fastCheap : pool.filter(m => modelIsFast(m));
    const candidates = fast.length > 0 ? fast : pool;
    return candidates.length > 0 ? pickRandom(candidates) : LLM_CONSTANTS.RANDOM;
}

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

const validateTheme = (theme: string): string | null => {
    if (!theme.trim()) {
        return "Theme cannot be empty";
    }
    return null;
};

const AVAILABLE_ROLES = [GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC];
const ROLE_TOOLTIPS: Record<string, string> = {
    [GAME_ROLES.DOCTOR]: 'Each night, protects one player from werewolf attacks. Cannot protect the same player two nights in a row. Has a one-time ability to kill instead of protect.',
    [GAME_ROLES.DETECTIVE]: 'Each night, investigates one player to learn if they are evil (werewolf or maniac) or innocent. Cannot investigate the same player twice. Has a one-time ability to kill a player instead of investigating.',
    [GAME_ROLES.MANIAC]: 'Each night, abducts one player — blocking all their actions and any actions targeting them. Abductions are secret. If the maniac dies at night, the abducted victim dies too. Aligned with villagers.',
};
const ROLE_GLYPHS: Record<string, React.ReactNode> = {
    doctor: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M3 7h8" /></svg>
    ),
    detective: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="5.5" r="3.5" /><path d="M8.5 8.5L12.5 12.5" /></svg>
    ),
    maniac: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2L12 12H2L7 2Z" /></svg>
    ),
};

const SECTION = "px-[clamp(16px,3vw,28px)] py-5 flex gap-5 flex-wrap";
const SECTION_LABEL = `${monoLabel} flex-[0_0_88px] pt-2`;
const SECTION_BODY = "flex-[1_1_320px] min-w-0 flex flex-col gap-3.5";
const CARD = "bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-lg)] px-[clamp(14px,3vw,18px)] py-4 flex flex-col";

export default function CreateNewGamePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // All hooks must be called before any conditional returns
    const [name, setName] = useState(() => pickRandom(RANDOM_NAMES));
    const [theme, setTheme] = useState(() => pickRandom(RANDOM_THEMES));
    const [description, setDescription] = useState('');
    // Free-text drawing direction for avatars/illustrations — image prompts only,
    // never the story prompts. Stays editable after the preview is generated, so
    // the live value (not the one baked into gameData) is what createGame gets.
    const [artStyle, setArtStyle] = useState('');
    const [playerCount, setPlayerCount] = useState(12);
    const [werewolfCount, setWerewolfCount] = useState(3);
    const [specialRoles, setSpecialRoles] = useState<string[]>([GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE, GAME_ROLES.MANIAC]);
    const [humanPlayerRole, setHumanPlayerRole] = useState<string>(RANDOM_ROLE);
    const [longReplies, setLongReplies] = useState(false);
    // Role-play (default) or tactical bots — see GAME_MODES. Stays editable after the
    // preview is generated; createGame gets the live value.
    const [gameMode, setGameMode] = useState<GameMode>(DEFAULT_GAME_MODE);
    const [gameMasterAiType, setGameMasterAiType] = useState<string>(() => {
        // Initial seed from the full catalog. Tier/key data isn't loaded yet on first
        // render — a reconciliation effect below re-picks from the user's actually-allowed
        // pool once that data is in.
        return pickDefaultGmModel(
            Object.values(LLM_CONSTANTS).filter(m => m !== LLM_CONSTANTS.RANDOM)
        );
    });
    // Fugu Ultra is opt-in only (expensive) — excluded from the default selection but
    // still selectable in the dropdown.
    const [selectedPlayerAiTypes, setSelectedPlayerAiTypes] = useState<string[]>(
        Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM && model !== LLM_CONSTANTS.FUGU_ULTRA)
    );
    const [isFormValid, setIsFormValid] = useState(false);
    const [gameData, setGameData] = useState<GamePreviewWithGeneratedBots | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // isLoading also covers createGame; the status card belongs to preview runs only.
    const [isPreviewing, setIsPreviewing] = useState(false);
    // Stage of the running preview generation (casting → character-sheet batches), polled
    // from the server while isLoading; null before the first poll lands.
    const [previewProgress, setPreviewProgress] = useState<PreviewProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);
    const [themeError, setThemeError] = useState<string | null>(null);
    const [playersAiError, setPlayersAiError] = useState<string | null>(null);
    const [, setFastModelsOnly] = useState(false);
    const [botNameErrors, setBotNameErrors] = useState<{[key: number]: string}>({});
    const [userTier, setUserTier] = useState<UserTier>('free');
    const [isTierLoaded, setIsTierLoaded] = useState(false);
    // Paid tier: the illustration set drawn for this preview (server-side
    // draft, polled while it draws). null until the player asks for one.
    const [draft, setDraft] = useState<AvatarDraftState | null>(null);
    const [draftBusy, setDraftBusy] = useState(false);
    const [draftError, setDraftError] = useState<string | null>(null);
    // Portrait clicked in the illustrations grid — opens its crop editor over
    // the sheet it was cut from.
    const [reframeEntry, setReframeEntry] = useState<CastEntry | null>(null);
    const hasInitializedPlayerModels = useRef(false);
    const playerOptions = useMemo(() => {
        const maxPlayers = 12;
        return Array.from({ length: maxPlayers - 5 }, (_, i) => i + 6);
    }, []);
    const candidateModels = useMemo(() => getCandidateModelsForTier(userTier), [userTier]);

    const gmModelOptions = useMemo(() => {
        // Tested single source of truth: free tier → free-tier catalog, paid → all models.
        return getCandidateModelsForTier(userTier)
            .map(model => {
                const name = getModelDisplayName(model);
                return { model, disabled: false, label: name, displayLabel: name };
            });
    }, [userTier]);

    // Free tier shows ALL models (available selectable, unavailable greyed out via
    // showUnavailableDisabled). Single tested source of truth — no inline tier rules here.
    const playerPickerOptions = useMemo(
        () => getModelPickerOptions(userTier, { showUnavailableDisabled: true }),
        [userTier]
    );
    const playerModelOptions = useMemo(
        () => playerPickerOptions.map(o => o.model),
        [playerPickerOptions]
    );

    // For the multi-select: provide meta (disabled + counter suffix) for each model option.
    const playerModelOptionMeta = useMemo(() => {
        if (userTier !== USER_TIERS.FREE) return undefined;
        const metaByModel = new Map(playerPickerOptions.map(o => [o.model, o]));
        return (model: string) => {
            const o = metaByModel.get(model);
            return o ? { disabled: o.disabled, suffix: o.suffix } : undefined;
        };
    }, [userTier, playerPickerOptions]);

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

    // The cast the illustrations are for, keyed the way the server keys
    // portrait docs (sanitized names + the GM key). A draft drawn for a
    // different key set is shown but not attached to the game.
    const cast = useMemo<CastEntry[]>(() => {
        if (!gameData) return [];
        return [
            ...gameData.bots.map(bot => ({ key: sanitizePlayerName(bot.name), name: bot.name, kind: 'bot' as const })),
            { key: sanitizePlayerName(gameData.name), name: gameData.name, kind: 'you' as const },
            { key: AVATAR_GM_KEY, name: 'Game Master', kind: 'gm' as const },
        ];
    }, [gameData]);
    const draftMatchesCast = useMemo(() => {
        if (!draft) return false;
        const a = [...draft.keys].sort(), b = cast.map(c => c.key).sort();
        return a.length === b.length && a.every((k, i) => k === b[i]);
    }, [draft, cast]);
    const draftReadyForCast = draft?.status === 'ready' && draftMatchesCast;

    // Poll the draft while the server draws it. The draw runs off the request
    // (like avatar generation at game creation), so this is the only way the
    // page learns it landed. 100 × 3s outlasts the worst case; the server also
    // reports a run that died as failed after its stale window.
    useEffect(() => {
        if (draft?.status !== 'generating') return;
        let cancelled = false;
        const poll = async () => {
            for (let i = 0; i < 100 && !cancelled; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (cancelled) return;
                try {
                    const fresh = await getAvatarDraft();
                    if (cancelled) return;
                    if (fresh) {
                        setDraft(fresh);
                        if (fresh.status !== 'generating') return;
                    }
                } catch (err) {
                    console.error('Illustration draft poll failed', err);
                }
            }
        };
        poll();
        return () => { cancelled = true; };
    }, [draft?.status]);

    const handleGenerateIllustrations = async () => {
        if (!gameData || draftBusy || draft?.status === 'generating') return;
        setDraftBusy(true);
        setDraftError(null);
        try {
            const state = await generateDraftIllustrations({
                theme: gameData.theme,
                description: gameData.description,
                artStyle,
                humanPlayerName: gameData.name,
                bots: gameData.bots.map(bot => ({ name: bot.name, gender: bot.gender, story: bot.story, visualDescription: bot.visualDescription })),
            });
            setDraft(state);
        } catch (err: any) {
            setDraftError(err?.message ?? 'Drawing failed.');
        } finally {
            setDraftBusy(false);
        }
    };

    // Save a moved crop: the server re-cuts the card from the stored sheet and
    // bumps that one key's cache-buster; the local draft picks both up so the
    // grid and the cast rows show the new crop without a poll.
    const handleReframeSave = async (key: string, index: number, framing: AvatarFraming) => {
        const result = await reframeDraftAvatar(key, index, framing);
        if (!result) throw new Error('This portrait has no sheet to reframe on.');
        setDraft(prev => {
            if (!prev) return prev;
            const entry = prev.avatarVariants[key];
            if (!entry) return prev;
            return {
                ...prev,
                avatarVariants: { ...prev.avatarVariants, [key]: { ...entry, framing: { ...(entry.framing ?? {}), [String(index)]: result.framing } } },
                avatarVersions: { ...prev.avatarVersions, [key]: result.version },
            };
        });
        setReframeEntry(null);
    };

    // GM defaults to RANDOM, resolved during preview generation

    useEffect(() => {
        if (!isTierLoaded) {
            return;
        }

        // Only candidate (available) models should be auto-selected
        const availablePlayerModels = candidateModels.filter(m => m !== LLM_CONSTANTS.RANDOM);
        // Set actually shown in the UI.
        const visiblePlayerModels = playerModelOptions;

        setSelectedPlayerAiTypes(prev => {
            const filtered = prev.filter(model => visiblePlayerModels.includes(model) && availablePlayerModels.includes(model));

            if (!hasInitializedPlayerModels.current) {
                hasInitializedPlayerModels.current = true;
                if (filtered.length > 0) {
                    return filtered;
                }
                // Fall back to whatever is actually visible. Fugu Ultra stays opt-in
                // unless it's the only thing available.
                const defaultVisible = visiblePlayerModels.filter(m => m !== LLM_CONSTANTS.FUGU_ULTRA);
                return defaultVisible.length > 0 ? defaultVisible : visiblePlayerModels;
            }

            if (filtered.length !== prev.length) {
                return filtered;
            }

            return prev;
        });
    }, [isTierLoaded, userTier, playerModelOptions, candidateModels]);

    // If the auto-picked GM model isn't allowed for the current tier, re-pick from
    // the user's actually-allowed models (fast preferred), regardless of tier.
    useEffect(() => {
        if (!isTierLoaded) return;
        if (gameMasterAiType === LLM_CONSTANTS.RANDOM) return;

        // Tested single source of truth for the allowed-for-this-user set.
        const allowed = getCandidateModelsForTier(userTier);
        if (allowed.includes(gameMasterAiType)) return;

        setGameMasterAiType(pickDefaultGmModel(allowed.filter(m => m !== LLM_CONSTANTS.RANDOM)));
    }, [isTierLoaded, userTier, gameMasterAiType]);

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

    // Build option list with remaining capacity for preview model dropdowns. Tier/usage
    // rules come from the shared helper; here we only decorate to the dropdown's shape.
    const getPreviewModelOptions = useMemo(() => {
        return (currentModel: string) =>
            getModelPickerOptions(userTier, {
                usageCounts: userTier === USER_TIERS.FREE ? previewUsageCounts : undefined,
                currentModel,
            }).map(({ model, disabled, suffix }) => {
                const displayLabel = getModelDisplayName(model);
                return { model, disabled, label: suffix ? `${displayLabel} ${suffix}` : displayLabel, displayLabel };
            });
    }, [userTier, previewUsageCounts]);

    // If the selected role becomes unavailable (its special role was unchecked), fall back to Random.
    // Must run before any conditional returns to keep hook order stable.
    useEffect(() => {
        const specialRoleValues: string[] = [GAME_ROLES.MANIAC, GAME_ROLES.DOCTOR, GAME_ROLES.DETECTIVE];
        if (specialRoleValues.includes(humanPlayerRole) && !specialRoles.includes(humanPlayerRole)) {
            setHumanPlayerRole(RANDOM_ROLE);
        }
    }, [specialRoles, humanPlayerRole]);

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

    // "Your Role" options. Villager and Werewolf are always available; the special roles
    // are only selectable when their corresponding special role is enabled above.
    const humanRoleOptions = [
        { value: RANDOM_ROLE, label: 'Random' },
        { value: GAME_ROLES.VILLAGER, label: 'Villager' },
        { value: GAME_ROLES.WEREWOLF, label: 'Werewolf' },
        { value: GAME_ROLES.MANIAC, label: 'Maniac', disabled: !specialRoles.includes(GAME_ROLES.MANIAC) },
        { value: GAME_ROLES.DOCTOR, label: 'Doctor', disabled: !specialRoles.includes(GAME_ROLES.DOCTOR) },
        { value: GAME_ROLES.DETECTIVE, label: 'Detective', disabled: !specialRoles.includes(GAME_ROLES.DETECTIVE) },
    ];

    const handleGeneratePreview = async () => {
        const gamePreviewData: GamePreview = {
            name,
            theme,
            description,
            artStyle,
            playerCount,
            werewolfCount,
            specialRoles,
            humanPlayerRole,
            longReplies,
            gameMode,
            gameMasterAiType,
            playersAiType: selectedPlayerAiTypes.length > 0 ? selectedPlayerAiTypes : [LLM_CONSTANTS.RANDOM]
        };

        setIsLoading(true);
        setIsPreviewing(true);
        setError(null);
        setPreviewProgress(null);

        // Progress channel: the server writes the pipeline's stage under this token while
        // previewGame runs; poll it until the action itself returns.
        const progressId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        let polling = true;
        (async () => {
            while (polling) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                if (!polling) return;
                try {
                    const fresh = await getPreviewProgress(progressId);
                    if (polling && fresh) setPreviewProgress(fresh);
                } catch (err) {
                    console.error('Preview progress poll failed', err);
                }
            }
        })();

        try {
            const game: GamePreviewWithGeneratedBots = await previewGame(gamePreviewData, progressId);

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
            // A new cast: whatever was drawn belongs to the previous one.
            setDraft(null);
            setDraftError(null);
            setReframeEntry(null);
        } catch (err: any) {
            // Provide user-friendly error messages for common issues
            let userFriendlyError = err.message;
            // The server tags model failures with the pipeline stage ("(while
            // casting the lobby)"); keep that tail on whatever friendly text follows.
            const stageTail = /\(while [^)]+\)\s*$/.exec(err.message)?.[0];

            if (err.message.includes('failed to produce a valid response')) {
                userFriendlyError = `The Game Master model failed to produce a valid response — the output was malformed or cut off. This happens occasionally; generate the preview again, or pick a different Game Master model.`;
            } else if (err.message.includes('Failed to parse JSON response') || err.message.includes('JSON mode failed')) {
                userFriendlyError = `The AI model had trouble generating a properly formatted response. This sometimes happens with certain models. Please try again, or consider using a different AI model for the Game Master.`;
            } else if (err.message.includes('Response validation failed')) {
                userFriendlyError = `The AI model generated an invalid response format. Please try again or use a different AI model.`;
            } else if (err.message.includes('Failed to get response') || err.message.includes('API')) {
                userFriendlyError = `Unable to connect to the AI service. Please try again.`;
            }

            if (stageTail && !userFriendlyError.includes(stageTail)) {
                userFriendlyError = `${userFriendlyError} Failed ${stageTail.slice(1, -1)}.`;
            }
            setError(userFriendlyError);
            console.error("Error previewing game:", err);
        } finally {
            polling = false;
            setPreviewProgress(null);
            setIsPreviewing(false);
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
            // Attach the preview's illustrations when they were drawn for this
            // exact cast: a ready set by version, a set still being drawn by
            // the in-progress marker (createGame waits for it).
            const avatarDraftVersion = draft && draftMatchesCast
                ? draft.status === 'ready' ? draft.version
                    : draft.status === 'generating' ? AVATAR_DRAFT_IN_PROGRESS
                        : undefined
                : undefined;
            const newGameId = await createGame({
                ...gameData,
                artStyle,
                gameMode,
                ...(avatarDraftVersion !== undefined ? { avatarDraftVersion } : {}),
            });
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
            setGameData({ ...gameData, scene: story });
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
                voiceProvider: voiceProvider,
                onPlaybackError: () => setIsSpeaking(false)
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

    // A drawn portrait for a cast key (with its framed circle), once the set
    // matches this cast; undefined keeps the initial-letter circle.
    const portraitFor = (key: string): RowPortrait | undefined => {
        if (!draftReadyForCast || !draft) return undefined;
        const framing = draftFraming(draft, key);
        return { url: draftImageUrl(draft, key), focus: framing ? circleFocus(framing.framing.circle) : undefined };
    };

    // The crop editor's source for the clicked portrait. Portraits cut before
    // sheets were kept have nothing to reframe on and simply don't open.
    const reframeSource = reframeEntry && draft ? draftFraming(draft, reframeEntry.key) : undefined;

    const gmVoices = gameData ? getVoiceConfig(gameData.voiceProvider).getVoicesByGender('male') : [];
    const gmVoice = gameData ? (gameData.gameMasterVoice || gmVoices[0]?.id || '') : '';
    const werewolfPercent = playerCount > 0 ? Math.round(werewolfCount / playerCount * 100) : 0;

    return (
        <div className="flex flex-col w-full h-full max-w-[1040px] mx-auto pt-6 sm:pt-10 pb-16 gap-7">
            {/* Form card */}
            <div className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-xl)] shadow-card">
                <div className="flex items-center justify-between gap-3 flex-wrap px-[clamp(16px,3vw,28px)] py-[18px] border-b border-[var(--line-1)]">
                    <div className="flex items-baseline gap-3 flex-wrap min-w-0">
                        <h1 className="m-0 text-lg font-semibold text-[var(--fg-0)]">Create New Game</h1>
                        <span className={monoMeta}>{playerCount} players · {werewolfCount} {werewolfCount === 1 ? 'wolf' : 'wolves'} · {specialRoles.length} special {specialRoles.length === 1 ? 'role' : 'roles'}</span>
                    </div>
                    <button
                        type="button"
                        className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 whitespace-nowrap transition-all duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleGeneratePreview}
                        disabled={!isFormValid || isLoading}
                    >
                        {isLoading ? 'Generating…' : gameData ? 'Regenerate Preview' : 'Generate Preview'}
                    </button>
                </div>

                <form id="create-game-form" className="flex flex-col" onSubmit={e => e.preventDefault()}>
                    {/* Setting */}
                    <div className={`${SECTION} border-b border-[var(--line-1)]`}>
                        <div className={SECTION_LABEL}>Setting</div>
                        <div className={SECTION_BODY}>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                                <div>
                                    <label className={labelStyle}>Your name</label>
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
                                    <label className={labelStyle}>Game title</label>
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
                            <div>
                                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
                                    <label className="text-[12px] font-medium text-[var(--fg-1)]">Instructions for the Game Master</label>
                                    <span className="text-[11px] text-[var(--fg-3)]">optional</span>
                                </div>
                                <textarea
                                    className={`${inputStyle} min-h-[58px] resize-y leading-[1.5]`}
                                    placeholder="A single family with old grudges. A horror twist. All characters female…"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                />
                            </div>
                            <div>
                                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
                                    <label className="text-[12px] font-medium text-[var(--fg-1)]">Art style</label>
                                    <span className="text-[11px] text-[var(--fg-3)]">optional · sets how portraits and scenes are drawn</span>
                                </div>
                                <input
                                    className={inputStyle}
                                    type="text"
                                    placeholder="90s anime cel animation, muted watercolor, gritty noir comic…"
                                    value={artStyle}
                                    onChange={(e) => setArtStyle(e.target.value)}
                                    maxLength={ART_STYLE_MAX_LENGTH}
                                />
                            </div>
                        </div>
                    </div>

                    {/* The table */}
                    <div className={`${SECTION} border-b border-[var(--line-1)]`}>
                        <div className={SECTION_LABEL}>The table</div>
                        <div className={SECTION_BODY}>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                                <div>
                                    <label className={labelStyle}>Players</label>
                                    <SelectDropdown
                                        options={playerOptions.map(count => ({ value: String(count), label: `${count} players`, displayLabel: String(count) }))}
                                        value={String(playerCount)}
                                        onChange={(val) => setPlayerCount(Number(val))}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <label className="text-[12px] font-medium text-[var(--fg-1)]">Werewolves</label>
                                        <span className={monoMeta}>{werewolfPercent}%</span>
                                        <InfoButton label="Werewolf count hint" size={16}>For a balanced game, werewolves should be about 20–30% of all players.</InfoButton>
                                    </div>
                                    <SelectDropdown
                                        options={Array.from({length: playerCount - 1}, (_, i) => ({ value: String(i), label: `${i} werewolves`, displayLabel: String(i) }))}
                                        value={String(werewolfCount)}
                                        onChange={(val) => setWerewolfCount(Number(val))}
                                    />
                                </div>
                                <div>
                                    <label className={labelStyle}>Your role</label>
                                    <SelectDropdown
                                        options={humanRoleOptions}
                                        value={humanPlayerRole}
                                        onChange={setHumanPlayerRole}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelStyle}>Special roles</label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {AVAILABLE_ROLES.map(role => {
                                        const isSelected = specialRoles.includes(role);
                                        const roleName = role.charAt(0).toUpperCase() + role.slice(1);
                                        return (
                                            <React.Fragment key={role}>
                                                <button
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    title={ROLE_TOOLTIPS[role]}
                                                    onClick={() => setSpecialRoles(isSelected ? specialRoles.filter(r => r !== role) : [...specialRoles, role])}
                                                    className={`flex items-center gap-2 pl-2 pr-3 py-[7px] rounded-[var(--radius-md)] border text-[13px] font-medium whitespace-nowrap transition-all duration-[120ms] ${
                                                        isSelected
                                                            ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                                                            : 'bg-[var(--bg-2)] border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-3)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)]'
                                                    }`}
                                                >
                                                    <span className={`w-[22px] h-[22px] rounded-full grid place-items-center ${isSelected ? 'bg-[var(--accent-line)]' : 'bg-[var(--bg-3)]'}`}>
                                                        {ROLE_GLYPHS[role]}
                                                    </span>
                                                    {roleName}
                                                </button>
                                                <InfoButton label={`${roleName} role info`}>{ROLE_TOOLTIPS[role]}</InfoButton>
                                            </React.Fragment>
                                        );
                                    })}
                                    <span className="text-[12px] text-[var(--fg-3)]">Click to toggle</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* The bots */}
                    <div className={SECTION}>
                        <div className={SECTION_LABEL}>The bots</div>
                        <div className={SECTION_BODY}>
                            {/* The model picker opens a search + provider-chip
                                popover the width of its trigger, so it gets the
                                whole row; halving it on a tablet wrapped the
                                chips into a tall narrow list. */}
                            <div>
                                <label className={labelStyle}>Models bots are drawn from</label>
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
                            <div className="max-w-[420px]">
                                <label className={labelStyle}>Game Master model</label>
                                <ModelSelectDropdown
                                    options={gmModelOptions}
                                    value={gameMasterAiType}
                                    onChange={setGameMasterAiType}
                                />
                            </div>
                            <div className="flex items-center gap-5 flex-wrap pt-0.5">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[12px] font-medium text-[var(--fg-1)]">Bot mode</span>
                                    <SegmentedControl<GameMode>
                                        value={gameMode}
                                        options={[{ value: GAME_MODES.ROLEPLAY, label: 'Role-play' }, { value: GAME_MODES.TACTICAL, label: 'Plain' }]}
                                        onChange={setGameMode}
                                    />
                                    <InfoButton label="Bot mode info">
                                        Role-play: bots are their characters — stories, grudges and motives drive whom they trust and vote for, alongside game evidence. Plain: the character is a facade over a strategist; only votes, claims and contradictions may drive suspicion.
                                    </InfoButton>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[12px] font-medium text-[var(--fg-1)]">Reply length</span>
                                    <SegmentedControl<'short' | 'long'>
                                        value={longReplies ? 'long' : 'short'}
                                        options={[{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }]}
                                        onChange={v => setLongReplies(v === 'long')}
                                    />
                                    <InfoButton label="Reply length info">
                                        Short: bots keep day-discussion replies to one or two sentences. Long: bots write longer, more detailed replies — more to read, more flavor.
                                    </InfoButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            {isPreviewing && <GeneratingStatus progress={previewProgress} />}

            {error && (
                <div className="p-4 bg-[oklch(70%_0.13_25_/_0.08)] border border-[oklch(70%_0.13_25_/_0.3)] rounded-[var(--radius-lg)]">
                    <div className="flex items-start gap-2">
                        <span className="text-[var(--danger)] text-lg flex-none">&#9888;</span>
                        <div>
                            <h3 className="text-[var(--danger)] font-semibold text-[14px] mb-1">Game Preview Generation Failed</h3>
                            <p className="text-[var(--fg-1)] text-[13px]">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview */}
            {gameData && (
                <div className="flex flex-col gap-[22px]">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">Preview</h2>
                        <span className={monoMeta}>story · {gameData.bots.length} characters · ready to start</span>
                        <span className="flex-1" />
                        <button type="button" className={secondaryButton} onClick={handleGeneratePreview} disabled={!isFormValid || isLoading}>
                            {isLoading ? 'Generating…' : 'Regenerate'}
                        </button>
                        <button type="button" className={primaryButton} onClick={handleCreateGame} disabled={isLoading}>
                            {isLoading ? 'Processing…' : 'Create Game'}
                        </button>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 items-stretch">
                        {/* Opening story */}
                        <div className={`${CARD} gap-2`}>
                            <div className="flex items-center gap-2">
                                <span className={monoLabel}>Opening story</span>
                                <span className="flex-1" />
                                <button
                                    type="button"
                                    className={`${iconButton} !w-[26px] !h-[26px] !rounded-[var(--radius-sm)]`}
                                    onClick={() => isSpeaking ? handleStopTTS() : handlePlayStory(gameData.scene, gmVoice, gameData.gameMasterVoiceStyle)}
                                    disabled={!gameData.scene}
                                    title={isSpeaking ? 'Stop speaking' : 'Play game story'}
                                    aria-label={isSpeaking ? 'Stop speaking' : 'Play game story'}
                                >
                                    <PlayIcon playing={isSpeaking} />
                                </button>
                            </div>
                            <textarea
                                id="gameStory"
                                aria-label="Opening story"
                                className={`${inputStyle} flex-1 min-h-[132px] resize-y leading-[1.6] py-2.5`}
                                value={gameData.scene}
                                onChange={(e) => handleStoryChange(e.target.value)}
                            />
                        </div>

                        {/* Game Master */}
                        <div className={`${CARD} gap-3`}>
                            <div className="flex items-center gap-2">
                                <span className={`${monoLabel} !text-[var(--gm-fg)]`}>Game Master</span>
                                <span className="flex-1" />
                                <span className="font-mono text-[10px] uppercase text-[var(--fg-3)]">{VOICE_PROVIDER_DISPLAY_NAMES[gameData.voiceProvider] || gameData.voiceProvider} voice</span>
                            </div>
                            <div>
                                <label className={labelStyle}>Model</label>
                                <ModelSelectDropdown
                                    options={getPreviewModelOptions(gameData.gameMasterAiType)}
                                    value={gameData.gameMasterAiType}
                                    onChange={(value) => handleGameMasterAiChange(value)}
                                    className="w-full"
                                />
                            </div>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
                                <div>
                                    <label className={labelStyle}>Voice</label>
                                    <SelectDropdown
                                        options={gmVoices.map(voice => ({ value: voice.id, label: voice.id, secondaryLabel: voice.gender }))}
                                        value={gmVoice}
                                        onChange={(val) => setGameData({ ...gameData, gameMasterVoice: val })}
                                    />
                                </div>
                                {gameData.gameMasterVoiceStyle !== undefined && (
                                    <div>
                                        <label className={labelStyle}>Voice style</label>
                                        <input
                                            type="text"
                                            className={inputStyle}
                                            value={gameData.gameMasterVoiceStyle}
                                            onChange={(e) => setGameData({ ...gameData, gameMasterVoiceStyle: e.target.value })}
                                            placeholder="e.g., authoritatively, dramatically"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Illustrations — paid tier draws them here; free games draw
                        their own set when they start. Hidden until the tier is
                        known so paid users never see the locked card flash. */}
                    {isTierLoaded && (
                        <IllustrationsPanel
                            draft={draft}
                            cast={cast}
                            castChanged={!!draft && draft.status !== 'generating' && !draftMatchesCast}
                            busy={draftBusy}
                            error={draftError}
                            onGenerate={handleGenerateIllustrations}
                            locked={userTier !== USER_TIERS.PAID}
                            upgradeHref="/profile"
                            onPortraitClick={draftReadyForCast ? setReframeEntry : undefined}
                        />
                    )}

                    <CastList
                        bots={gameData.bots}
                        humanName={gameData.name}
                        botPortrait={index => portraitFor(sanitizePlayerName(gameData.bots[index].name))}
                        humanPortrait={portraitFor(sanitizePlayerName(gameData.name))}
                        botNameErrors={botNameErrors}
                        onPlayerChange={handlePlayerChange}
                        onBotAiChange={handleBotAiChange}
                        modelOptionsFor={getPreviewModelOptions}
                        voiceOptions={getVoiceConfig(gameData.voiceProvider).getVoices().map(voice => ({ value: voice.id, label: voice.id, secondaryLabel: voice.gender }))}
                        isSpeaking={isSpeaking}
                        onPlay={handlePlayStory}
                        onStop={handleStopTTS}
                    />

                    {/* Bottom actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" className={secondaryButton} onClick={handleGeneratePreview} disabled={!isFormValid || isLoading}>
                            {isLoading ? 'Generating…' : 'Regenerate'}
                        </button>
                        <button type="button" className={primaryButton} onClick={handleCreateGame} disabled={isLoading}>
                            {isLoading ? 'Processing…' : 'Create Game'}
                        </button>
                    </div>
                </div>
            )}

            {/* Crop editor for a clicked preview portrait, over the sheet it
                was cut from. */}
            {reframeEntry && draft && reframeSource && (
                <ReframeModal
                    name={reframeEntry.name}
                    sheetUrl={`/api/avatar-drafts/${avatarSheetKey(reframeSource.index)}?v=${draft.version}`}
                    framing={reframeSource.framing}
                    initial={reframeSource.initial}
                    onSave={framing => handleReframeSave(reframeEntry.key, reframeSource.index, framing)}
                    onClose={() => setReframeEntry(null)}
                />
            )}
        </div>
    );
}
