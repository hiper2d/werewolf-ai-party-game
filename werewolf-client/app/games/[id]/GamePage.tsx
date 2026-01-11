'use client';

import { useEffect, useMemo, useState } from 'react';
import { getGame, updateBotModel, updateGameMasterModel, clearGameErrorState, setGameErrorState, afterGameDiscussion } from "@/app/api/game-actions";
import { startNewDay, summarizePastDay } from "@/app/api/night-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, GAME_ROLES, AUTO_VOTE_COEFFICIENT, BOT_SELECTION_CONFIG } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote, keepBotsGoing, manualSelectBots } from '@/app/api/bot-actions';
import BotSelectionDialog from '@/app/games/[id]/components/BotSelectionDialog';
import { replayNight, performNightAction } from '@/app/api/night-actions';
import { getPlayerColor } from "@/app/utils/color-utils";
import { checkGameEndConditions } from "@/app/utils/game-utils";
import { isTierMismatchError } from '@/app/api/errors';
import { UIControlsProvider, useUIControls } from './context/UIControlsContext';

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
    const [selectedBot, setSelectedBot] = useState<{ name: string; aiType: string; enableThinking?: boolean } | null>(null);
    const [clearNightMessages, setClearNightMessages] = useState(false);
    const { openModal, closeModal, areControlsEnabled } = useUIControls();
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;

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
        if (game.gameState !== GAME_STATES.NIGHT_RESULTS || !game.nightResults) {
            return game;
        }

        // Simulate elimination of werewolf target if not protected
        const nightResults = game.nightResults;
        let simulatedBots = [...game.bots];

        if (nightResults.werewolf && nightResults.werewolf.target) {
            const targetName = nightResults.werewolf.target;
            const doctorProtectedTarget = nightResults.doctor && nightResults.doctor.target === targetName;

            if (!doctorProtectedTarget) {
                // Eliminate the target in simulation
                simulatedBots = simulatedBots.map(bot => {
                    if (bot.name === targetName) {
                        return { ...bot, isAlive: false };
                    }
                    return bot;
                });
            }
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
                // Call welcome API if there are bots to introduce OR if queue is empty (to transition state)
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
                const updatedGame = await runGameAction(() => welcome(game.id));
                console.log('✅ GAMEPAGE: Welcome API completed');
                if (updatedGame) {
                    setGame(updatedGame);
                }
            }
        };

        handleWelcome();
    }, [game.gameState, game.id, game.gameStateParamQueue, game.errorState]);

    // Handle vote state - trigger when in VOTE state and queue changes (including when it becomes empty)
    useEffect(() => {
        // Only proceed if we're in VOTE state and no error
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

        // Special handling for empty queue - this should trigger vote results
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
            const updatedGame = await runGameAction(() => vote(game.id));
            if (updatedGame) {
                console.log('✅ Vote API completed, updating game state:', {
                    oldState: game.gameState,
                    newState: updatedGame.gameState,
                    oldQueueLength: game.gameStateProcessQueue.length,
                    newQueueLength: updatedGame.gameStateProcessQueue.length
                });
                setGame(updatedGame);
            }
        };

        handleVote();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);

    // Handle NIGHT state - process night actions when in NIGHT state
    useEffect(() => {
        const handleNightAction = async () => {
            if (game.gameState === GAME_STATES.NIGHT && !game.errorState) {
                // Check if queues are empty - this means all night actions are done and we need to generate summary
                if (game.gameStateProcessQueue.length === 0) {
                    console.log('🌙 GAMEPAGE: Night queues empty, generating night summary', {
                        gameId: game.id,
                        timestamp: new Date().toISOString()
                    });
                    const updatedGame = await runGameAction(() => performNightAction(game.id));
                    console.log('✅ GAMEPAGE: Night summary generation completed');
                    if (updatedGame) {
                        setGame(updatedGame);
                    }
                    return;
                }
                
                // Process night actions if queue has items
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
                
                // Skip auto-processing if it's the human player's turn for this role
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
                    const updatedGame = await runGameAction(() => performNightAction(game.id));
                    console.log('✅ GAMEPAGE: PerformNightAction API completed');
                    if (updatedGame) {
                        setGame(updatedGame);
                    }
                }
            }
        };

        handleNightAction();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.gameStateParamQueue.length, game.gameStateParamQueue.join(','), game.humanPlayerRole, game.humanPlayerName, game.id, game.errorState]);

    // Handle NEW_DAY_BOT_SUMMARIES state - automatically process bot summaries
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
                    const updatedGame = await runGameAction(() => summarizePastDay(game.id));
                    console.log('✅ GAMEPAGE: SummarizeCurrentDay API completed');
                    if (updatedGame) {
                        setGame(updatedGame);
                    }
                } catch (error: any) {
                    if (handleGameActionError(error)) {
                        return;
                    }
                    console.error('💭 GAMEPAGE: SummarizeCurrentDay failed:', error);
                    
                    // Set error state so user can see the issue and take action
                    const errorState = {
                        error: `Failed to generate summary: ${error.message}`,
                        details: error.details || 'Summary generation encountered an error',
                        context: error.context || {},
                        recoverable: error.recoverable !== false, // Default to recoverable unless explicitly set to false
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
                        // Fallback: just log the error if we can't set the error state
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
        try {
            const updatedGame = await runGameAction(() => manualSelectBots(game.id, selectedBots));
            if (updatedGame) {
                setGame(updatedGame);
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
            isAlive: !isGameOver // Human player is alive unless game is over
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
                
                // Calculate progress for current role
                let progressText = '';
                
                if (currentRole === 'werewolf') {
                    // For werewolves, show remaining messages in the discussion
                    const remainingMessages = paramQueue.length;
                    
                    if (remainingMessages > 1) {
                        progressText = `s are talking (${remainingMessages} messages remain)`;
                    } else if (remainingMessages === 1) {
                        progressText = ` (final action)`;
                    }
                } else {
                    // For other roles, show simple counter if multiple players have the role
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
                return {
                    title: "👋 Introductions",
                    description: paramQueue.length > 0 ? "Bots introducing themselves:" : "Introductions complete",
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

    return (
        <div className="flex h-full theme-text-primary overflow-hidden">
            {/* Left column - Game info and participants */}
            <div className="w-1/5 flex flex-col pr-2 h-full">
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Game info */}
                    <div className="theme-bg-card theme-border border rounded p-4 mb-4 flex-shrink-0 theme-shadow">
                        <h1 className="text-2xl font-bold mb-2">{game.theme}</h1>
                        <p className="text-sm theme-text-secondary mb-4">{game.description}</p>
                        {game.totalGameCost !== undefined && game.totalGameCost > 0 && (
                            <div className="text-xs text-left w-full">
                                <span className="theme-text-secondary font-mono">
                                    Total Game Cost: ${game.totalGameCost.toFixed(4)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Participants list */}
                    <div className="theme-bg-card theme-border border rounded p-4 flex-grow overflow-auto theme-shadow">
                        <h2 className="text-xl font-bold mb-2">Participants</h2>
                        <ul>
                            {participants.map((participant, index) => (
                                <li
                                    key={index}
                                    className={`mb-3 flex flex-col ${!participant.isAlive ? 'opacity-60' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            style={{ color: getPlayerColor(participant.name) }}
                                            className={!participant.isAlive ? 'line-through' : ''}
                                        >
                                            {participant.name}
                                            {participant.isHuman && ' (You)'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {!participant.isHuman && !participant.isGameMaster && (() => {
                                                const bot = game.bots.find(b => b.name === participant.name);
                                                const cost = bot?.tokenUsage?.costUSD;
                                                return cost && cost > 0 ? (
                                                    <span className="text-xs theme-text-secondary font-mono">
                                                        ${cost.toFixed(4)}
                                                    </span>
                                                ) : null;
                                            })()}
                                            {game.humanPlayerRole === GAME_ROLES.WEREWOLF && participant.role === GAME_ROLES.WEREWOLF && (
                                                <span className="text-sm" title="Werewolf teammate">🐺</span>
                                            )}
                                            {!participant.isAlive && (
                                                <span className="text-sm" title="Eliminated">💀</span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Show AI model for non-human participants */}
                                    {!participant.isHuman && participant.aiType && (
                                        <div className="text-xs mt-1 text-left w-full">
                                            <button
                                                onClick={() => openModelDialog(participant.name, participant.aiType!, participant.enableThinking)}
                                                className={`theme-text-secondary hover:opacity-70 transition-colors duration-200 text-left w-full ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title="Click to change AI model"
                                                disabled={!areControlsEnabled}
                                            >
                                                Model: {participant.aiType}
                                            </button>
                                        </div>
                                    )}
                                    {/* Show human role explicitly */}
                                    {participant.isHuman && (
                                        <div className="text-xs theme-text-secondary mt-1 ml-2">
                                            Role: {participant.role}
                                        </div>
                                    )}
                                    {/* Show role for eliminated non-human players, when game is over, or for other werewolves if human is werewolf */}
                                    {(!participant.isAlive || isGameOver || (game.humanPlayerRole === GAME_ROLES.WEREWOLF && participant.role === GAME_ROLES.WEREWOLF)) && !participant.isHuman && (
                                        <div className="text-xs theme-text-secondary mt-1 ml-2">
                                            Role: {participant.role}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="flex-1 h-full overflow-hidden px-2">
                <GameChat
                    gameId={game.id}
                    game={game}
                    onGameStateChange={setGame}
                    clearNightMessages={clearNightMessages}
                    onErrorHandled={handleErrorCleared}
                />
            </div>

            {/* Right column - Queue Info and controls */}
            <div className="w-1/5 flex flex-col pl-2 h-full">
                <div className="theme-bg-card theme-border border rounded p-4 flex-grow overflow-auto theme-shadow">
                    <h2 className="text-lg font-bold mb-2">{queueInfo.title}</h2>
                    <p className="text-sm theme-text-secondary mb-3">{queueInfo.description}</p>
                    {queueInfo.subtitle && (
                        <p className="text-xs theme-text-secondary mb-3">{queueInfo.subtitle}</p>
                    )}
                    
                    {queueInfo.items.length > 0 ? (
                        <ul className="space-y-2">
                            {queueInfo.items.map((item, index) => (
                                <li
                                    key={index}
                                    className={`text-sm p-2 rounded ${
                                        item === queueInfo.currentItem
                                            ? 'bg-blue-600 bg-opacity-50 border border-blue-400'
                                            : 'bg-gray-200 dark:bg-gray-700 bg-opacity-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            style={{ color: getPlayerColor(item) }}
                                            className={item === queueInfo.currentItem ? 'font-semibold' : ''}
                                        >
                                            {item}
                                            {item === game.humanPlayerName && ' (You)'}
                                        </span>
                                        {item === queueInfo.currentItem && (
                                            <span className="text-xs text-blue-300">▶ Current</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-8">
                            <div className="text-4xl mb-2">🤖</div>
                            <p className="text-sm theme-text-secondary italic">All bots are idle</p>
                        </div>
                    )}

                    {queueInfo.showProgress && queueInfo.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t theme-border-subtle">
                            <div className="text-xs theme-text-secondary mb-1">
                                Progress: {queueInfo.currentItem ? queueInfo.items.length - (queueInfo.items.indexOf(queueInfo.currentItem) + 1) : queueInfo.items.length} remaining
                            </div>
                            <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${queueInfo.currentItem ? ((queueInfo.items.indexOf(queueInfo.currentItem) + 1) / queueInfo.items.length) * 100 : 0}%`
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {/* Manual Bot Selection Button - only show when queue is empty and in discussion phase */}
                    {(game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) && game.gameStateProcessQueue.length === 0 && (
                        <div className="mt-3 pt-3 border-t theme-border-subtle">
                            <button
                                className={`w-full ${buttonTransparentStyle} text-sm ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => openModal('botSelection')}
                                disabled={!areControlsEnabled}
                                title="Manually select which bots should respond"
                            >
                                ✋ Select Bots Manually
                            </button>
                        </div>
                    )}
                </div>

                {(isGameOver || game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.VOTE_RESULTS || game.gameState === GAME_STATES.NIGHT || game.gameState === GAME_STATES.NIGHT_RESULTS || (game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES && game.gameStateProcessQueue.length > 0)) && (
                    <div className="theme-bg-card theme-border border rounded p-4 mt-4 theme-shadow">
                    {game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION ? (
                        <div className="flex flex-col gap-3">
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-2">💬 Post-Game Discussion</h3>
                                <p className="text-xs theme-text-secondary mb-2">All roles revealed. Everyone can participate!</p>
                            </div>
                            <div className="flex gap-2 justify-center flex-wrap">
                                <button
                                    className={`${buttonTransparentStyle} ${!areControlsEnabled || game.gameStateProcessQueue.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={!areControlsEnabled || game.gameStateProcessQueue.length > 0}
                                    onClick={async () => {
                                        const updatedGame = await runGameAction(() => keepBotsGoing(game.id));
                                        if (updatedGame) {
                                            setGame(updatedGame);
                                        }
                                    }}
                                    title={game.gameStateProcessQueue.length > 0 ? 'Bots are already talking' : `Let ${BOT_SELECTION_CONFIG.MIN}-${BOT_SELECTION_CONFIG.MAX} bots continue the conversation`}
                                >
                                    Keep Going
                                </button>
                                <button
                                    className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500 !text-white ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={handleExitGame}
                                    disabled={!areControlsEnabled}
                                    title="Return to the games list"
                                >
                                    Exit Game
                                </button>
                            </div>
                        </div>
                    ) : isGameOver ? (
                        <div className="text-center">
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">🎭 Game Over</h3>
                                <p className="text-sm theme-text-secondary">The game has ended. All roles have been revealed above.</p>
                            </div>
                            <button
                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500 !text-white ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={handleExitGame}
                                disabled={!areControlsEnabled}
                                title="Return to the games list"
                            >
                                Exit Game
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {game.gameState === GAME_STATES.DAY_DISCUSSION && (
                                <div className="flex gap-2 justify-center">
                                    <button
                                        className={`${buttonTransparentStyle} ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''} ${voteUrgency.isUrgent ? 'bg-red-600 hover:bg-red-700 border-red-500 !text-white animate-pulse' : voteUrgency.isWarning ? 'bg-yellow-500 hover:bg-yellow-600 border-yellow-400 !text-black' : ''}`}
                                        disabled={!areControlsEnabled}
                                        onClick={async () => {
                                            const updatedGame = await runGameAction(() => vote(game.id));
                                            if (updatedGame) {
                                                setGame(updatedGame);
                                            }
                                        }}
                                        title={voteUrgency.isUrgent
                                            ? `Vote now! Auto-voting in ${Math.ceil(voteUrgency.messagesLeft)} messages`
                                            : `Start the voting phase (${Math.round(voteUrgency.percentage)}% to auto-vote)`}
                                    >
                                        Vote {(voteUrgency.isUrgent || voteUrgency.isWarning) && '⚠️'}
                                    </button>
                                    <button
                                        className={`${buttonTransparentStyle} ${!areControlsEnabled || game.gameStateProcessQueue.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={!areControlsEnabled || game.gameStateProcessQueue.length > 0}
                                        onClick={async () => {
                                            const updatedGame = await runGameAction(() => keepBotsGoing(game.id));
                                            if (updatedGame) {
                                                setGame(updatedGame);
                                            }
                                        }}
                                        title={game.gameStateProcessQueue.length > 0 ? 'Bots are already talking' : `Let ${BOT_SELECTION_CONFIG.MIN}-${BOT_SELECTION_CONFIG.MAX} bots continue the conversation`}
                                    >
                                        Keep Going
                                    </button>
                                </div>
                            )}
                            {game.gameState === GAME_STATES.VOTE_RESULTS && (
                                <div className="flex flex-col gap-2 items-center">
                                    {showVoteGameOverCTA && pendingGameOverReason && (
                                        <p className="text-sm text-red-600 dark:text-red-300 text-center">
                                            {pendingGameOverReason}
                                        </p>
                                    )}
                                    <div className="flex gap-2 justify-center flex-wrap">
                                        {!showVoteGameOverCTA && (
                                            <button
                                                className={`${buttonTransparentStyle} bg-blue-600 hover:bg-blue-700 border-blue-500 !text-white ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={!areControlsEnabled}
                                                onClick={async () => {
                                                    console.log('🌙 GAMEPAGE: START NIGHT BUTTON CLICKED:', {
                                                        gameId: game.id,
                                                        currentState: game.gameState,
                                                        timestamp: new Date().toISOString()
                                                    });
                                                    const updatedGame = await runGameAction(() => performNightAction(game.id));
                                                    console.log('✅ GAMEPAGE: Start Night button - PerformNightAction API completed');
                                                    if (updatedGame) {
                                                        setGame(updatedGame);
                                                    }
                                                }}
                                                title="Begin the night phase where werewolves and special roles take their actions"
                                            >
                                                🌙 Start Night
                                            </button>
                                        )}
                                        {showVoteGameOverCTA && (
                                            <button
                                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500 !text-white ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={!areControlsEnabled}
                                                onClick={async () => {
                                                    const updatedGame = await runGameAction(() => afterGameDiscussion(game.id));
                                                    if (updatedGame) {
                                                        setGame(updatedGame);
                                                    }
                                                }}
                                                title="End the game and move to after-game discussion"
                                            >
                                                🎭 Game Over
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NIGHT && (
                                <div className="text-sm text-yellow-400 text-center">
                                    🌙 Night in progress...
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NIGHT_RESULTS && (
                                <div className="flex flex-col gap-2 items-center">
                                    {showNightGameOverCTA && pendingGameOverReason && (
                                        <p className="text-sm text-red-600 dark:text-red-300 text-center mb-2">
                                            {pendingGameOverReason}
                                        </p>
                                    )}
                                    <div className="flex gap-2 justify-center flex-wrap">
                                        <button
                                            className={`${buttonTransparentStyle} min-w-[70px] max-w-[90px] ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={!areControlsEnabled}
                                            onClick={async () => {
                                                setClearNightMessages(true);
                                                const updatedGame = await runGameAction(() => replayNight(game.id));
                                                if (updatedGame) {
                                                    setGame(updatedGame);
                                                }
                                                setTimeout(() => setClearNightMessages(false), 100);
                                            }}
                                            title="Clear night messages and replay the night phase actions"
                                        >
                                            Replay Night
                                        </button>
                                        {showNightGameOverCTA ? (
                                            <button
                                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500 min-w-[70px] max-w-[90px] !text-white ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={!areControlsEnabled}
                                                onClick={async () => {
                                                    const updatedGame = await runGameAction(() => afterGameDiscussion(game.id));
                                                    if (updatedGame) {
                                                        setGame(updatedGame);
                                                    }
                                                }}
                                                title="End the game and move to after-game discussion"
                                            >
                                                Game Over
                                            </button>
                                        ) : (
                                            <button
                                                className={`${buttonTransparentStyle} min-w-[70px] max-w-[90px] ${!areControlsEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={!areControlsEnabled}
                                                onClick={async () => {
                                                    const updatedGame = await runGameAction(() => startNewDay(game.id));
                                                    if (updatedGame) {
                                                        setGame(updatedGame);
                                                    }
                                                }}
                                                title="Continue to apply night results and start new day"
                                            >
                                                Next Day
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES && (
                                <div className="text-sm text-blue-600 dark:text-blue-400 text-center">
                                    💭 Generating day summaries... ({game.gameStateProcessQueue.length} bots remaining)
                                </div>
                            )}
                        </div>
                    )}
                </div>
                )}
            </div>
            
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
