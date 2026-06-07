'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGame, updateBotModel, updateGameMasterModel, clearGameErrorState, setGameErrorState, afterGameDiscussion } from "@/app/api/game-actions";
import { startNewDay, summarizePastDay } from "@/app/api/night-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
const btnGhost = "px-3 py-1.5 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]";
const btnDanger = "px-3 py-1.5 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms]";
const btnAccent = "px-3 py-1.5 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110 transition-all duration-[120ms]";
const btnWarn = "px-3 py-1.5 text-[13px] font-medium rounded-[var(--radius-md)] bg-[oklch(75%_0.10_65)] text-[var(--bg-0)] hover:brightness-110 transition-all duration-[120ms]";
import { getModelDisplayName } from "@/app/ai/ai-models";
import { GAME_STATES, GAME_ROLES, AUTO_VOTE_COEFFICIENT, BOT_SELECTION_CONFIG } from "@/app/api/game-models";
import type { Game, GameActionResponse, GameMessage } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote, keepBotsGoing, manualSelectBots, cancelBotResponses } from '@/app/api/bot-actions';
import BotSelectionDialog from '@/app/games/[id]/components/BotSelectionDialog';
import { replayNight, performNightAction } from '@/app/api/night-actions';
import PlayerAvatar from "@/app/components/PlayerAvatar";
import { checkGameEndConditions } from "@/app/utils/game-utils";
import { isTierMismatchError } from '@/app/api/errors';
import { UIControlsProvider, useUIControls } from './context/UIControlsContext';
import React from 'react';

interface Participant {
    name: string;
    role: string;
    isHuman: boolean;
    isAlive: boolean;
    aiType?: string;
    enableThinking?: boolean;
    isGameMaster?: boolean;
}

export default function GamePage({
    initialGame,
    session
}: {
    initialGame: Game,
    session: Session | null
}) {
    return (
        <UIControlsProvider>
            <GamePageContent initialGame={initialGame} session={session} />
        </UIControlsProvider>
    );
}

function GamePageContent({
    initialGame,
    session
}: {
    initialGame: Game,
    session: Session | null
}) {
    const [game, setGame] = useState(initialGame);
    const [pendingMessages, setPendingMessages] = useState<GameMessage[]>([]);
    const [selectedBot, setSelectedBot] = useState<{ name: string; aiType: string; enableThinking?: boolean } | null>(null);
    const [clearNightMessages, setClearNightMessages] = useState(false);
    const [isKeepGoingLoading, setIsKeepGoingLoading] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const preActionGameRef = useRef<Game | null>(null);
    const cancelledRef = useRef(false);

    const applyActionResult = useCallback((result: GameActionResponse) => {
        setGame(prev => {
            // If queue was locally cleared by cancel, don't restore it from a stale in-flight result
            if (cancelledRef.current && result.game.gameStateProcessQueue.length > 0
                && (prev.gameState === GAME_STATES.DAY_DISCUSSION || prev.gameState === GAME_STATES.AFTER_GAME_DISCUSSION)) {
                cancelledRef.current = false;
                return { ...result.game, gameStateProcessQueue: [] };
            }
            return result.game;
        });
        if (result.messages.length > 0) {
            setPendingMessages(prev => [...prev, ...result.messages]);
        }
    }, []);
    const { openModal, closeModal, areControlsEnabled } = useUIControls();
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;

    // Mobile panel overlay state
    const [mobilePanel, setMobilePanel] = useState<'players' | 'status' | null>(null);

    const modelUsageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        const increment = (model?: string) => {
            if (!model) {
                return;
            }
            counts[model] = (counts[model] ?? 0) + 1;
        };

        increment(game.gameMasterAiType);
        for (const bot of game.bots) {
            increment(bot.aiType);
        }

        return counts;
    }, [game]);

    // Helper function to simulate game state after applying night results
    const simulateNightResults = useMemo(() => {
        if (game.gameState !== GAME_STATES.NIGHT_RESULTS || !game.resolvedNightState) {
            return game;
        }

        const deaths = game.resolvedNightState.deaths || [];
        const deadNames = new Set(deaths.map(d => d.player));

        // Mark killed bots as dead
        let simulatedBots = game.bots.map(bot =>
            deadNames.has(bot.name) ? { ...bot, isAlive: false } : bot
        );

        // If the human player died, add them as a pseudo-bot entry
        if (deadNames.has(game.humanPlayerName)) {
            simulatedBots = [
                ...simulatedBots,
                { name: game.humanPlayerName, role: game.humanPlayerRole, isAlive: false } as any
            ];
        }

        return { ...game, bots: simulatedBots };
    }, [game]);

    const gameEndStatus = useMemo(() => checkGameEndConditions(game), [game]);
    const nightResultsEndStatus = useMemo(() => checkGameEndConditions(simulateNightResults), [simulateNightResults]);
    const showVoteGameOverCTA = !isGameOver && gameEndStatus.isEnded && game.gameState === GAME_STATES.VOTE_RESULTS;
    const showNightGameOverCTA = !isGameOver && nightResultsEndStatus.isEnded && game.gameState === GAME_STATES.NIGHT_RESULTS;
    const pendingGameOverReason = (showVoteGameOverCTA || showNightGameOverCTA) ? (game.gameState === GAME_STATES.NIGHT_RESULTS ? nightResultsEndStatus.reason : gameEndStatus.reason) : undefined;

    // Calculate vote urgency based on message count vs threshold
    const voteUrgency = useMemo(() => {
        if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
            return { percentage: 0, isUrgent: false, isWarning: false, messagesLeft: 0 };
        }
        const alivePlayersCount = game.bots.filter(bot => bot.isAlive).length + 1; // +1 for human
        const threshold = alivePlayersCount * AUTO_VOTE_COEFFICIENT;
        const currentMessages = Object.values(game.dayActivityCounter || {}).reduce((sum, count) => sum + count, 0);
        const percentage = threshold > 0 ? (currentMessages / threshold) * 100 : 0;
        const messagesLeft = Math.max(0, threshold - currentMessages);
        return {
            percentage: Math.min(percentage, 100),
            isUrgent: percentage >= 90,
            isWarning: percentage >= 70,
            messagesLeft
        };
    }, [game.gameState, game.bots, game.dayActivityCounter]);

    // Show Cancel button after 10 seconds of bot processing
    useEffect(() => {
        const isProcessing = (game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION)
            && (game.gameStateProcessQueue.length > 0 || isKeepGoingLoading);

        if (isProcessing) {
            const timer = setTimeout(() => setShowCancel(true), 10_000);
            return () => clearTimeout(timer);
        } else {
            setShowCancel(false);
            preActionGameRef.current = null;
        }
    }, [game.gameState, game.gameStateProcessQueue.length, isKeepGoingLoading]);

    // Handle cancel: restore pre-action state, clear server queue
    const handleCancelBotResponses = useCallback(async () => {
        setShowCancel(false);
        setIsKeepGoingLoading(false);
        cancelledRef.current = true;

        // Clear server queue
        await cancelBotResponses(game.id).catch(() => {});

        // Restore pre-action game state or re-fetch from server
        if (preActionGameRef.current) {
            setGame({
                ...preActionGameRef.current,
                gameStateProcessQueue: [],
            });
            preActionGameRef.current = null;
        } else {
            // Fallback: just clear the queue locally
            setGame(prev => ({ ...prev, gameStateProcessQueue: [] }));
        }
    }, [game.id]);

    // Handle exit game
    const handleExitGame = () => {
        window.location.href = '/games';
    };

    const redirectForTierMismatch = () => {
        window.location.href = `/games?error=tier_mismatch&blocked=${encodeURIComponent(game.id)}`;
    };

    const handleGameActionError = (error: unknown) => {
        if (isTierMismatchError(error) || (error instanceof Error && error.message === 'TIER_MISMATCH')) {
            redirectForTierMismatch();
            return true;
        }
        return false;
    };

    const runGameAction = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
        try {
            return await action();
        } catch (error) {
            if (handleGameActionError(error)) {
                return undefined;
            }
            throw error;
        }
    };

    // Handle welcome state
    useEffect(() => {
        const handleWelcome = async () => {
            if (game.gameState === GAME_STATES.WELCOME && !game.errorState) {
                if (game.gameStateParamQueue.length > 0) {
                    console.log('🎭 GAMEPAGE: CALLING WELCOME API for bot introductions:', {
                        gameId: game.id,
                        paramQueue: game.gameStateParamQueue,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    console.log('🎭 GAMEPAGE: CALLING WELCOME API to transition from empty queue:', {
                        gameId: game.id,
                        timestamp: new Date().toISOString()
                    });
                }
                const result = await runGameAction(() => welcome(game.id));
                console.log('✅ GAMEPAGE: Welcome API completed');
                if (result) {
                    applyActionResult(result);
                }
            }
        };

        handleWelcome();
    }, [game.gameState, game.id, game.gameStateParamQueue, game.errorState]);

    // Handle vote state
    useEffect(() => {
        if (game.gameState !== GAME_STATES.VOTE || game.errorState) {
            return;
        }

        console.log('🔍 VOTE PROCESSING CHECK:', {
            gameState: game.gameState,
            queueLength: game.gameStateProcessQueue.length,
            queue: game.gameStateProcessQueue,
            hasError: !!game.errorState,
            gameId: game.id,
            timestamp: new Date().toISOString()
        });

        if (game.gameStateProcessQueue.length === 0) {
            console.log('🎯 EMPTY QUEUE DETECTED - TRIGGERING VOTE RESULTS:', {
                gameId: game.id,
                gameState: game.gameState,
                timestamp: new Date().toISOString()
            });
        }

        const handleVote = async () => {
            console.log('🚨 CALLING VOTE API', {
                gameId: game.id,
                queue: game.gameStateProcessQueue,
                queueLength: game.gameStateProcessQueue.length,
                isEmptyQueue: game.gameStateProcessQueue.length === 0
            });
            const result = await runGameAction(() => vote(game.id));
            if (result) {
                console.log('✅ Vote API completed, updating game state:', {
                    oldState: game.gameState,
                    newState: result.game.gameState,
                    oldQueueLength: game.gameStateProcessQueue.length,
                    newQueueLength: result.game.gameStateProcessQueue.length
                });
                applyActionResult(result);
            }
        };

        handleVote();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);

    // Handle NIGHT state
    useEffect(() => {
        const handleNightAction = async () => {
            if (game.gameState === GAME_STATES.NIGHT && !game.errorState) {
                if (game.gameStateProcessQueue.length === 0) {
                    console.log('🌙 GAMEPAGE: Night queues empty, generating night summary', {
                        gameId: game.id,
                        timestamp: new Date().toISOString()
                    });
                    const result = await runGameAction(() => performNightAction(game.id));
                    console.log('✅ GAMEPAGE: Night summary generation completed');
                    if (result) {
                        applyActionResult(result);
                    }
                    return;
                }

                if (game.gameStateProcessQueue.length > 0) {
                    const currentRole = game.gameStateProcessQueue[0];
                    const currentPlayer = game.gameStateParamQueue.length > 0 ? game.gameStateParamQueue[0] : null;

                    console.log('🔍 GAMEPAGE: AUTO-PROCESS NIGHT CHECK:', {
                        currentRole,
                        currentPlayer,
                        humanPlayerRole: game.humanPlayerRole,
                        humanPlayerName: game.humanPlayerName,
                        isHumanPlayerTurn: currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName,
                        gameId: game.id,
                        timestamp: new Date().toISOString()
                    });

                    if (currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName) {
                        console.log('🌙 GAMEPAGE: SKIPPING AUTO-PROCESS - Human player turn for night action', {
                            currentRole,
                            currentPlayer,
                            humanPlayerRole: game.humanPlayerRole,
                            humanPlayerName: game.humanPlayerName
                        });
                        return;
                    }

                    console.log('🌙 GAMEPAGE: CALLING PERFORM_NIGHT_ACTION API', {
                        gameState: game.gameState,
                        queueLength: game.gameStateProcessQueue.length,
                        queue: game.gameStateProcessQueue,
                        gameId: game.id,
                        timestamp: new Date().toISOString()
                    });
                    const result = await runGameAction(() => performNightAction(game.id));
                    console.log('✅ GAMEPAGE: PerformNightAction API completed');
                    if (result) {
                        applyActionResult(result);
                    }
                }
            }
        };

        handleNightAction();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.gameStateParamQueue.length, game.gameStateParamQueue.join(','), game.humanPlayerRole, game.humanPlayerName, game.id, game.errorState]);

    // Handle NEW_DAY_BOT_SUMMARIES state
    useEffect(() => {
        const handleSummaryGeneration = async () => {
            if (game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES &&
                !game.errorState) {

                console.log('💭 GAMEPAGE: AUTO-PROCESS SUMMARY CHECK:', {
                    gameState: game.gameState,
                    queueLength: game.gameStateProcessQueue.length,
                    queue: game.gameStateProcessQueue,
                    gameId: game.id,
                    timestamp: new Date().toISOString()
                });

                try {
                    const result = await runGameAction(() => summarizePastDay(game.id));
                    console.log('✅ GAMEPAGE: SummarizeCurrentDay API completed');
                    if (result) {
                        applyActionResult(result);
                    }
                } catch (error: any) {
                    if (handleGameActionError(error)) {
                        return;
                    }
                    console.error('💭 GAMEPAGE: SummarizeCurrentDay failed:', error);

                    const errorState = {
                        error: `Failed to generate summary: ${error.message}`,
                        details: error.details || 'Summary generation encountered an error',
                        context: error.context || {},
                        recoverable: error.recoverable !== false,
                        timestamp: Date.now()
                    };

                    try {
                        const gameWithError = await runGameAction(() => setGameErrorState(game.id, errorState));
                        if (gameWithError) {
                            setGame(gameWithError);
                        }
                    } catch (setErrorError) {
                        if (handleGameActionError(setErrorError)) {
                            return;
                        }
                        console.error('💭 GAMEPAGE: Failed to set error state:', setErrorError);
                    }
                }
            }
        };

        handleSummaryGeneration();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);


    // Handle state changes logging
    useEffect(() => {
        console.log('📊 GAME STATE CHECK:', {
            gameState: game.gameState,
            gameId: game.id,
            timestamp: new Date().toISOString()
        });
    }, [game.gameState, game.id]);

    if (!game) {
        return <div>Game not found</div>;
    }

    // Handle error cleared callback from GameChat
    const handleErrorCleared = async () => {
        try {
            const updatedGame = await runGameAction(() => clearGameErrorState(game.id));
            if (updatedGame) {
                setGame(updatedGame);
            }
        } catch (error) {
            if (handleGameActionError(error)) {
                return;
            }
            console.error('Failed to clear error state:', error);
        }
    };

    // Handle manual bot selection
    const handleManualBotSelection = async (selectedBots: string[]) => {
        setMobilePanel(null);
        try {
            const result = await runGameAction(() => manualSelectBots(game.id, selectedBots));
            if (result) {
                applyActionResult(result);
            }
        } catch (error) {
            if (handleGameActionError(error)) {
                return;
            }
            console.error('Failed to manually select bots:', error);
        }
    };

    // Handle model update
    const handleModelUpdate = async (newModel: string) => {
        if (!selectedBot) return;

        try {
            let updatedGame: Game | undefined;
            if (selectedBot.name === 'Game Master') {
                updatedGame = await runGameAction(() => updateGameMasterModel(game.id, newModel));
            } else {
                updatedGame = await runGameAction(() => updateBotModel(game.id, selectedBot.name, newModel));
            }
            if (updatedGame) {
                setGame(updatedGame);
            }
        } catch (error) {
            if (handleGameActionError(error)) {
                return;
            }
            console.error('Error updating model:', error);
        }
    };

    const openModelDialog = (botName: string, currentModel: string, enableThinking?: boolean) => {
        setSelectedBot({ name: botName, aiType: currentModel, enableThinking });
        openModal('modelSelection');
    };

    // Combine human player and bots for participants list
    const participants: Participant[] = [
        {
            name: 'Game Master',
            role: 'Game Master',
            isHuman: false,
            isAlive: true,
            aiType: game.gameMasterAiType,
            isGameMaster: true,
        },
        {
            name: game.humanPlayerName,
            role: game.humanPlayerRole,
            isHuman: true,
            isAlive: !isGameOver || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION
        },
        ...game.bots.map(bot => ({
            name: bot.name,
            role: bot.role,
            isHuman: false,
            isAlive: bot.isAlive,
            aiType: bot.aiType,
            enableThinking: bot.enableThinking
        }))
    ];

    // Helper function to get queue info based on game state
    const getQueueInfo = () => {
        const processQueue = game.gameStateProcessQueue || [];
        const paramQueue = game.gameStateParamQueue || [];

        switch (game.gameState) {
            case GAME_STATES.VOTE:
                return {
                    title: "🗳️ Voting Queue",
                    description: processQueue.length > 0 ? "Bots will vote in this order:" : "No bots voting currently",
                    items: processQueue,
                    currentItem: processQueue[0] || null,
                    showProgress: processQueue.length > 0
                };
            case GAME_STATES.NIGHT:
                const currentRole = processQueue[0];
                const currentPlayer = paramQueue[0];

                let progressText = '';

                if (currentRole === 'werewolf') {
                    const remainingMessages = paramQueue.length;
                    if (remainingMessages > 1) {
                        progressText = `s are talking (${remainingMessages} messages remain)`;
                    } else if (remainingMessages === 1) {
                        progressText = ` (final action)`;
                    }
                } else {
                    const totalPlayersForRole = paramQueue.length;
                    if (totalPlayersForRole > 1) {
                        const currentPosition = totalPlayersForRole - paramQueue.length + 1;
                        progressText = ` (${currentPosition} of ${totalPlayersForRole})`;
                    }
                }

                return {
                    title: "🌙 Night Actions",
                    description: currentRole ? `Current: ${currentRole}${progressText}` : "No night actions currently",
                    items: processQueue,
                    currentItem: currentRole || null,
                    showProgress: processQueue.length > 0,
                    subtitle: paramQueue.length > 0 ? `Processing night actions...` : undefined
                };
            case GAME_STATES.NEW_DAY_BOT_SUMMARIES:
                return {
                    title: "💭 Summary Generation",
                    description: processQueue.length > 0 ? "Generating summaries for:" : "Summary generation complete",
                    items: processQueue,
                    currentItem: processQueue[0] || null,
                    showProgress: processQueue.length > 0
                };
            case GAME_STATES.DAY_DISCUSSION:
                return {
                    title: "💬 Discussion Queue",
                    description: processQueue.length > 0 ? "Bots will talk in this order:" : "No bots thinking currently",
                    items: processQueue,
                    currentItem: processQueue[0] || null,
                    showProgress: processQueue.length > 0
                };
            case GAME_STATES.WELCOME:
                const totalBots = game.bots.length;
                const botsCompleted = totalBots - paramQueue.length;
                return {
                    title: "👋 Introductions",
                    description: paramQueue.length > 0 ? `Bots introducing themselves (${botsCompleted}/${totalBots} done):` : "Introductions complete",
                    items: paramQueue,
                    currentItem: paramQueue[0] || null,
                    showProgress: paramQueue.length > 0
                };
            case GAME_STATES.VOTE_RESULTS:
                return {
                    title: "📊 Vote Results",
                    description: "Processing vote results...",
                    items: [],
                    currentItem: null,
                    showProgress: false
                };
            case GAME_STATES.NIGHT_RESULTS:
                return {
                    title: "🌅 Night Complete",
                    description: "Night phase finished - ready to start new day",
                    items: [],
                    currentItem: null,
                    showProgress: false
                };
            case GAME_STATES.GAME_OVER:
                return {
                    title: "🎭 Game Over",
                    description: "Game has ended",
                    items: [],
                    currentItem: null,
                    showProgress: false
                };
            case GAME_STATES.AFTER_GAME_DISCUSSION:
                return {
                    title: "💬 After Game Discussion",
                    description: processQueue.length > 0 ? "Bots will talk in this order:" : "No bots thinking currently",
                    items: processQueue,
                    currentItem: processQueue[0] || null,
                    showProgress: processQueue.length > 0
                };
            default:
                return {
                    title: "🤖 Bot Status",
                    description: "No bots thinking currently",
                    items: [],
                    currentItem: null,
                    showProgress: false
                };
        }
    };

    const queueInfo = getQueueInfo();

    // Build game controls JSX to pass to GameChat
    const flowControlsElement = buildFlowControls();
    const chatControlsElement = buildChatControls();

    // Cancel button shown in the top-right corner of the input area after 10s
    const cancelButtonElement = showCancel ? (
        <button
            type="button"
            onClick={handleCancelBotResponses}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms]"
            title="Cancel bot responses"
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    ) : null;

    // Chat controls: Vote + Go On — shown inside the composer toolbar alongside Send
    function buildChatControls(): React.ReactNode {
        if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
            game.gameStateProcessQueue.length === 0 && !isKeepGoingLoading) {
            return (
                <>
                    <button
                        className={`${voteUrgency.isUrgent ? btnDanger + ' animate-pulse' : voteUrgency.isWarning ? btnWarn : btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!areControlsEnabled}
                        onClick={async () => {
                            const result = await runGameAction(() => vote(game.id));
                            if (result) {
                                applyActionResult(result);
                            }
                        }}
                        title={voteUrgency.isUrgent
                            ? `Vote now! Auto-voting in ${Math.ceil(voteUrgency.messagesLeft)} messages`
                            : `Start the voting phase (${Math.round(voteUrgency.percentage)}% to auto-vote)`}
                    >
                        Vote {(voteUrgency.isUrgent || voteUrgency.isWarning) && '\u26A0\uFE0F'}
                    </button>
                    <button
                        className={`${btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!areControlsEnabled}
                        onClick={async () => {
                            preActionGameRef.current = game;
                            setIsKeepGoingLoading(true);
                            try {
                                const result = await runGameAction(() => keepBotsGoing(game.id));
                                if (result) {
                                    applyActionResult(result);
                                }
                            } finally {
                                setIsKeepGoingLoading(false);
                            }
                        }}
                        title={`Let ${BOT_SELECTION_CONFIG.MIN}-${BOT_SELECTION_CONFIG.MAX} bots continue the conversation`}
                    >
                        Go on
                    </button>
                </>
            );
        }

        if (game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION &&
            game.gameStateProcessQueue.length === 0 && !isKeepGoingLoading) {
            return (
                <button
                    className={`${btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!areControlsEnabled}
                    onClick={async () => {
                        preActionGameRef.current = game;
                        setIsKeepGoingLoading(true);
                        try {
                            const result = await runGameAction(() => keepBotsGoing(game.id));
                            if (result) {
                                applyActionResult(result);
                            }
                        } finally {
                            setIsKeepGoingLoading(false);
                        }
                    }}
                    title={`Let ${BOT_SELECTION_CONFIG.MIN}-${BOT_SELECTION_CONFIG.MAX} bots continue the conversation`}
                >
                    Go on
                </button>
            );
        }

        return null;
    }

    // Flow controls: Start Night, Game Over, Next Day, etc. — shown in standalone bar above composer
    function buildFlowControls(): React.ReactNode {
        const showControls = isGameOver || game.gameState === GAME_STATES.VOTE_RESULTS || game.gameState === GAME_STATES.NIGHT || game.gameState === GAME_STATES.NIGHT_RESULTS || (game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES && game.gameStateProcessQueue.length > 0);

        if (!showControls) return null;

        if (game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) {
            if (game.gameStateProcessQueue.length > 0 || isKeepGoingLoading) return null;
            return (
                <div className="flex items-center gap-2">
                    <button
                        className={`${btnDanger} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleExitGame}
                        disabled={!areControlsEnabled}
                        title="Return to the games list"
                    >
                        Exit Game
                    </button>
                </div>
            );
        }

        if (isGameOver) {
            return (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--danger)]">Game Over</span>
                    <button
                        className={`${btnDanger} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleExitGame}
                        disabled={!areControlsEnabled}
                        title="Return to the games list"
                    >
                        Exit Game
                    </button>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-2 flex-wrap">
                {game.gameState === GAME_STATES.VOTE_RESULTS && (
                    <>
                        {showVoteGameOverCTA && pendingGameOverReason && (
                            <span className="text-sm text-[var(--danger)]">
                                {pendingGameOverReason}
                            </span>
                        )}
                        {!showVoteGameOverCTA && (
                            <button
                                className={`${btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!areControlsEnabled}
                                onClick={async () => {
                                    const result = await runGameAction(() => performNightAction(game.id));
                                    if (result) {
                                        applyActionResult(result);
                                    }
                                }}
                                title="Begin the night phase where werewolves and special roles take their actions"
                            >
                                🌙 Start Night
                            </button>
                        )}
                        {showVoteGameOverCTA && (
                            <button
                                className={`${btnDanger} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!areControlsEnabled}
                                onClick={async () => {
                                    const result = await runGameAction(() => afterGameDiscussion(game.id));
                                    if (result) {
                                        applyActionResult(result);
                                    }
                                }}
                                title="End the game and move to after-game discussion"
                            >
                                🎭 Game Over
                            </button>
                        )}
                    </>
                )}
                {game.gameState === GAME_STATES.NIGHT && (
                    <span className="text-sm text-[var(--fg-2)]">Night in progress...</span>
                )}
                {game.gameState === GAME_STATES.NIGHT_RESULTS && (
                    <>
                        {showNightGameOverCTA && pendingGameOverReason && (
                            <span className="text-sm text-[var(--danger)]">
                                {pendingGameOverReason}
                            </span>
                        )}
                        <button
                            className={`${btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={!areControlsEnabled}
                            onClick={async () => {
                                setClearNightMessages(true);
                                const result = await runGameAction(() => replayNight(game.id));
                                if (result) {
                                    applyActionResult(result);
                                }
                                setTimeout(() => setClearNightMessages(false), 100);
                            }}
                            title="Clear night messages and replay the night phase actions"
                        >
                            Replay Night
                        </button>
                        {showNightGameOverCTA ? (
                            <button
                                className={`${btnDanger} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!areControlsEnabled}
                                onClick={async () => {
                                    const result = await runGameAction(() => afterGameDiscussion(game.id));
                                    if (result) {
                                        applyActionResult(result);
                                    }
                                }}
                                title="End the game and move to after-game discussion"
                            >
                                Game Over
                            </button>
                        ) : (
                            <button
                                className={`${btnGhost} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!areControlsEnabled}
                                onClick={async () => {
                                    const result = await runGameAction(() => startNewDay(game.id));
                                    if (result) {
                                        applyActionResult(result);
                                    }
                                }}
                                title="Continue to apply night results and start new day"
                            >
                                Next Day
                            </button>
                        )}
                    </>
                )}
                {game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES && (
                    <span className="text-[13px] text-[var(--fg-2)]">
                        💭 {game.gameStateProcessQueue[0]} is generating summary... ({game.gameStateProcessQueue.length} remaining)
                    </span>
                )}
            </div>
        );
    }

    // Left panel content (reused in desktop sidebar and mobile overlay)
    const leftPanelContent = (
        <>
            {/* Game info */}
            <div className="mb-3 flex-shrink-0">
                <h1 className="text-[18px] font-semibold text-[var(--fg-0)] mb-1">{game.theme}</h1>
                <p className="text-[12px] text-[var(--fg-2)] mb-2 leading-relaxed">{game.description}</p>
                {game.totalGameCost !== undefined && game.totalGameCost > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--fg-2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--tag-fast-text)]"></span>
                        ${game.totalGameCost.toFixed(4)}
                    </div>
                )}
            </div>

            {/* Participants list */}
            <div className="flex-grow overflow-auto hide-scrollbar border-t border-[var(--line-1)] pt-3">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">Participants</h2>
                </div>
                <ul className="space-y-1">
                    {participants.map((participant, index) => {
                        const isHuman = participant.isHuman;
                        const isDead = !participant.isAlive;
                        return (
                        <li
                            key={index}
                            className={`flex flex-col px-2 py-1.5 rounded-[var(--radius-md)] transition-all duration-[120ms] ${
                                isHuman ? 'bg-[var(--accent-soft)] border border-[var(--accent-line)]' :
                                isDead ? 'opacity-70 hover:opacity-100 hover:bg-[var(--bg-1)]' :
                                'hover:bg-[var(--bg-2)]'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <PlayerAvatar name={participant.name} size={32} isGM={participant.isGameMaster} isDead={isDead} />
                                <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                        className={`text-[13px] font-medium truncate ${isDead ? 'line-through text-[var(--fg-3)]' : participant.isGameMaster ? 'text-[var(--gm-fg)]' : isHuman ? 'text-[var(--you-fg)]' : 'text-[var(--fg-0)]'}`}
                                    >
                                        {participant.name}
                                    </span>
                                    {/* "You" chip */}
                                    {isHuman && (
                                        <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded border bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]">
                                            you
                                        </span>
                                    )}
                                    {/* Inline role tag */}
                                    {(isHuman || isDead || isGameOver || (game.humanPlayerRole === GAME_ROLES.WEREWOLF && participant.role === GAME_ROLES.WEREWOLF)) && !participant.isGameMaster && (
                                        <span className={`text-[9px] font-mono font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded border ${
                                            participant.role === GAME_ROLES.WEREWOLF
                                                ? 'bg-[oklch(60%_0.13_25_/_0.12)] border-[oklch(60%_0.13_25_/_0.3)] text-[var(--werewolf-fg)]'
                                                : participant.role === GAME_ROLES.DOCTOR
                                                    ? 'bg-[oklch(60%_0.14_145_/_0.12)] border-[oklch(60%_0.14_145_/_0.3)] text-[oklch(65%_0.14_145)]'
                                                    : participant.role === GAME_ROLES.DETECTIVE
                                                        ? 'bg-[oklch(60%_0.10_70_/_0.12)] border-[oklch(60%_0.10_70_/_0.3)] text-[oklch(75%_0.10_70)]'
                                                        : participant.role === GAME_ROLES.MANIAC
                                                            ? 'bg-[oklch(60%_0.14_320_/_0.12)] border-[oklch(60%_0.14_320_/_0.3)] text-[oklch(65%_0.14_320)]'
                                                            : isDead
                                                                ? 'bg-transparent border-[var(--line-2)] text-[var(--fg-3)] opacity-85'
                                                                : 'bg-[var(--bg-2)] border-[var(--line-2)] text-[var(--fg-2)]'
                                        }`}>
                                            {participant.role}
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] font-mono text-[var(--fg-2)]">
                                {isHuman ? (
                                    <span>Playing as you</span>
                                ) : participant.aiType ? (
                                    <button
                                        onClick={() => openModelDialog(participant.name, participant.aiType!, participant.enableThinking)}
                                        className={`hover:text-[var(--fg-0)] transition-colors duration-[120ms] text-left ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title="Click to change AI model"
                                        disabled={!areControlsEnabled}
                                    >
                                        {getModelDisplayName(participant.aiType!)}
                                    </button>
                                ) : null}
                            </div>
                            </div>{/* end flex-1 column */}
                            </div>{/* end avatar row */}
                        </li>
                        );
                    })}
                </ul>
            </div>
        </>
    );

    // Right panel content (queue info only, no game controls since those moved to chat)
    const rightPanelContent = (
        <div className="flex-grow overflow-auto hide-scrollbar">
            <h2 className="text-[15px] font-semibold text-[var(--fg-0)] mb-1">{queueInfo.title}</h2>
            <p className="text-[12px] text-[var(--fg-2)] mb-3">{queueInfo.description}</p>
            {queueInfo.subtitle && (
                <p className="text-[11px] text-[var(--fg-3)] mb-3">{queueInfo.subtitle}</p>
            )}

            {queueInfo.items.length > 0 ? (
                <ul className="space-y-1.5">
                    {queueInfo.items.map((item, index) => {
                        const isCurrent = item === queueInfo.currentItem;
                        return (
                        <li
                            key={index}
                            className={`text-[13px] px-3 py-2 rounded-[var(--radius-md)] border transition-all duration-[120ms] ${
                                isCurrent
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent-line)]'
                                    : 'bg-[var(--bg-2)] border-[var(--line-1)]'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span
                                    className={`text-[var(--fg-0)] ${isCurrent ? 'font-medium' : ''}`}
                                >
                                    {item}
                                    {item === game.humanPlayerName && <span className="text-[var(--fg-3)] ml-1">(You)</span>}
                                </span>
                                {isCurrent && (
                                    <span className="text-[10px] font-mono italic text-[var(--accent)]">replying...</span>
                                )}
                            </div>
                        </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="text-center py-8">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--bg-2)] border border-[var(--line-2)] flex items-center justify-center text-[var(--fg-3)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><path d="M7 11V8a5 5 0 0 1 10 0v3"/>
                        </svg>
                    </div>
                    <p className="text-[13px] font-medium text-[var(--fg-1)] mb-1">Auto-discussion paused</p>
                    <p className="text-[12px] italic text-[var(--fg-2)]">Bots respond after you speak</p>
                </div>
            )}

            {queueInfo.showProgress && queueInfo.items.length > 0 && (() => {
                const isWelcome = game.gameState === GAME_STATES.WELCOME;
                const total = isWelcome ? game.bots.length : queueInfo.items.length;
                const completed = isWelcome ? (game.bots.length - queueInfo.items.length) : (queueInfo.currentItem ? queueInfo.items.indexOf(queueInfo.currentItem) : 0);
                const remaining = total - completed - (isWelcome ? 0 : 1);
                const progressPct = total > 0 ? ((completed + (isWelcome ? 0 : 1)) / total) * 100 : 0;

                return (
                    <div className="mt-3 pt-3 border-t border-[var(--line-1)]">
                        <div className="text-[11px] font-mono text-[var(--fg-2)] mb-1.5">
                            {remaining > 0 ? `${remaining} remaining` : 'Almost done'}
                        </div>
                        <div className="w-full bg-[var(--bg-3)] rounded-full h-1.5">
                            <div
                                className="bg-[var(--accent)] h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                            ></div>
                        </div>
                    </div>
                );
            })()}

            {/* Manual Bot Selection Button */}
            {(game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) && game.gameStateProcessQueue.length === 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--line-1)]">
                    <button
                        className={`w-full px-3 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms] flex items-center justify-center gap-2 ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => openModal('botSelection')}
                        disabled={!areControlsEnabled}
                        title="Manually select which bots should respond"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
                            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                        </svg>
                        Select Bots Manually
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col lg:flex-row text-[var(--fg-0)] h-full">
            {/* Fixed edge drawer toggle buttons (mobile/tablet only) */}
            <button
                className="fixed left-0 top-1/2 -translate-y-1/2 z-40 lg:hidden bg-[var(--bg-1)] border border-[var(--line-2)] rounded-r-lg p-2 shadow-subtle"
                onClick={() => setMobilePanel('players')}
                aria-label="Open players panel"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-1)]">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            </button>
            <button
                className="fixed right-0 top-1/2 -translate-y-1/2 z-40 lg:hidden bg-[var(--bg-1)] border border-[var(--line-2)] rounded-l-lg p-2 shadow-subtle"
                onClick={() => setMobilePanel('status')}
                aria-label="Open status panel"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-1)]">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
            </button>

            {/* Left column - Game info and participants (desktop only) */}
            <div className="hidden lg:flex lg:w-1/5 lg:flex-col lg:h-full lg:overflow-auto hide-scrollbar">
                {leftPanelContent}
            </div>

            {/* Center - Chat */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col lg:px-4">
                <GameChat
                    gameId={game.id}
                    game={game}
                    onGameStateChange={applyActionResult}
                    pendingMessages={pendingMessages}
                    onPendingMessagesConsumed={() => setPendingMessages([])}
                    clearNightMessages={clearNightMessages}
                    onErrorHandled={handleErrorCleared}
                    onChangeModel={(botName: string) => {
                        const currentModel = botName === 'Game Master'
                            ? game.gameMasterAiType
                            : game.bots.find(b => b.name === botName)?.aiType;
                        const enableThinking = botName === 'Game Master'
                            ? undefined
                            : game.bots.find(b => b.name === botName)?.enableThinking;
                        if (currentModel) {
                            openModelDialog(botName, currentModel, enableThinking);
                        }
                    }}
                    isExternalLoading={isKeepGoingLoading}
                    gameControls={flowControlsElement}
                    chatControls={chatControlsElement}
                    onBeforeAction={() => { preActionGameRef.current = game; }}
                    cancelButton={cancelButtonElement}
                />
            </div>

            {/* Right column - Queue Info (desktop only) */}
            <div className="hidden lg:flex lg:w-1/5 lg:flex-col lg:h-full lg:overflow-auto hide-scrollbar">
                {rightPanelContent}
            </div>

            {/* Mobile drawer overlay */}
            {mobilePanel && (
                <div
                    className="fixed inset-0 z-50 lg:hidden"
                    onClick={() => setMobilePanel(null)}
                >
                    <div className="absolute inset-0 bg-[var(--overlay)]" />
                    <div
                        className={`absolute inset-y-0 w-80 max-w-[85vw] bg-[var(--bg-1)] border-[var(--line-1)] overflow-auto p-4 flex flex-col shadow-pop ${
                            mobilePanel === 'players' ? 'left-0 border-r' : 'right-0 border-l'
                        }`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={`flex items-center justify-between mb-4 ${mobilePanel === 'status' ? 'flex-row-reverse' : ''}`}>
                            <h2 className="text-[15px] font-semibold text-[var(--fg-0)]">
                                {mobilePanel === 'players' ? 'Players & Info' : 'Game Status'}
                            </h2>
                            <button
                                className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-3)] text-[var(--fg-2)] transition-colors duration-[120ms]"
                                onClick={() => setMobilePanel(null)}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        {mobilePanel === 'players' ? leftPanelContent : rightPanelContent}
                    </div>
                </div>
            )}

            {/* Model Selection Dialog */}
            <ModelSelectionDialog
                onClose={() => {
                    closeModal('modelSelection');
                    setSelectedBot(null);
                }}
                onSelect={handleModelUpdate}
                currentModel={selectedBot?.aiType || ''}
                botName={selectedBot?.name || ''}
                gameTier={game.createdWithTier}
                usageCounts={modelUsageCounts}
            />

            {/* Bot Selection Dialog */}
            <BotSelectionDialog
                onClose={() => closeModal('botSelection')}
                onConfirm={handleManualBotSelection}
                bots={game.bots}
                dayActivityCounter={game.dayActivityCounter || {}}
                humanPlayerName={game.humanPlayerName}
            />
        </div>
    );
}
