'use client';

import { useEffect, useState } from 'react';
import { getGame, updateBotModel, updateGameMasterModel, clearGameErrorState, setGameErrorState, afterGameDiscussion } from "@/app/api/game-actions";
import { startNewDay, summarizePastDay } from "@/app/api/night-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote, keepBotsGoing } from '@/app/api/bot-actions';
import { replayNight, performNightAction } from '@/app/api/night-actions';
import { getPlayerColor } from "@/app/utils/color-utils";
import { isTierMismatchError } from '@/app/api/errors';

interface Participant {
    name: string;
    role: string;
    isHuman: boolean;
    isAlive: boolean;
    aiType?: string;
    enableThinking?: boolean;
}

export default function GamePage({ 
    initialGame, 
    session 
}: { 
    initialGame: Game, 
    session: Session | null 
}) {
    const [game, setGame] = useState(initialGame);
    const [modelDialogOpen, setModelDialogOpen] = useState(false);
    const [selectedBot, setSelectedBot] = useState<{ name: string; aiType: string; enableThinking?: boolean } | null>(null);
    const [clearNightMessages, setClearNightMessages] = useState(false);

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

    // Check if game is over
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;

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
        setModelDialogOpen(true);
    };

    // Combine human player and bots for participants list
    const participants: Participant[] = [
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
                    description: "Discussing the game after it has ended",
                    items: [],
                    currentItem: null,
                    showProgress: false
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
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column - Game info and participants */}
            <div className="w-1/5 flex flex-col pr-2 overflow-auto">
                {/* Game info */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">{game.theme}</h1>
                    <p className="text-sm text-gray-300 mb-4">{game.description}</p>
                    <div className="text-sm text-gray-400 mb-2">
                        Day {game.currentDay} - {game.gameState}
                    </div>
                    <div className="text-xs text-left w-full mb-1">
                        <button
                            onClick={() => openModelDialog('Game Master', game.gameMasterAiType)}
                            className="text-gray-500 hover:text-gray-300 transition-colors duration-200 text-left w-full"
                            title="Click to change Game Master AI model"
                        >
                            Game Master Model: {game.gameMasterAiType}
                        </button>
                    </div>
                    <div className="text-xs text-left w-full mb-1">
                        <span className="text-gray-500">
                            Your Role: {game.humanPlayerRole}
                        </span>
                    </div>
                    {game.totalGameCost !== undefined && game.totalGameCost > 0 && (
                        <div className="text-xs text-left w-full">
                            <span className="text-gray-600 font-mono">
                                Total Game Cost: ${game.totalGameCost.toFixed(4)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Participants list */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4 flex-grow overflow-auto">
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
                                        {!participant.isHuman && (() => {
                                            const bot = game.bots.find(b => b.name === participant.name);
                                            const cost = bot?.tokenUsage?.costUSD;
                                            return cost && cost > 0 ? (
                                                <span className="text-xs text-gray-600 font-mono">
                                                    ${cost.toFixed(4)}
                                                </span>
                                            ) : null;
                                        })()}
                                        {!participant.isAlive && (
                                            <span className="text-sm text-red-400">💀 Eliminated</span>
                                        )}
                                    </div>
                                </div>
                                {/* Show AI model for all bots */}
                                {!participant.isHuman && participant.aiType && (
                                    <div className="text-xs mt-1 text-left w-full">
                                        <button
                                            onClick={() => openModelDialog(participant.name, participant.aiType!, participant.enableThinking)}
                                            className="text-gray-500 hover:text-gray-300 transition-colors duration-200 text-left w-full"
                                            title="Click to change AI model"
                                        >
                                            Model: {participant.aiType}
                                        </button>
                                    </div>
                                )}
                                {/* Show role for eliminated players or when game is over */}
                                {(!participant.isAlive || isGameOver) && (
                                    <div className="text-xs text-gray-400 mt-1 ml-2">
                                        Role: {participant.role}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Game controls */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4">
                    {isGameOver ? (
                        <div className="text-center">
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-red-400 mb-2">🎭 Game Over</h3>
                                <p className="text-sm text-gray-300">The game has ended. All roles have been revealed above.</p>
                            </div>
                            <button
                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500`}
                                onClick={handleExitGame}
                                title="Return to the games list"
                            >
                                Exit Game
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2 justify-center">
                            {game.gameState === GAME_STATES.DAY_DISCUSSION && (
                                <>
                                    <button
                                        className={buttonTransparentStyle}
                                        onClick={async () => {
                                            const updatedGame = await runGameAction(() => vote(game.id));
                                            if (updatedGame) {
                                                setGame(updatedGame);
                                            }
                                        }}
                                        title="Start the voting phase to eliminate a suspected werewolf"
                                    >
                                        Vote
                                    </button>
                                    <button
                                        className={`${buttonTransparentStyle} ${game.gameStateProcessQueue.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={game.gameStateProcessQueue.length > 0}
                                        onClick={async () => {
                                            const updatedGame = await runGameAction(() => keepBotsGoing(game.id));
                                            if (updatedGame) {
                                                setGame(updatedGame);
                                            }
                                        }}
                                        title={game.gameStateProcessQueue.length > 0 ? 'Bots are already talking' : 'Let 1-3 bots continue the conversation'}
                                    >
                                        Keep Going
                                    </button>
                                </>
                            )}
                            {game.gameState === GAME_STATES.VOTE_RESULTS && (
                                <div className="flex gap-2 justify-center">
                                    <button
                                        className={`${buttonTransparentStyle} bg-blue-600 hover:bg-blue-700 border-blue-500`}
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
                                    <button
                                        className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500`}
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
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NIGHT && (
                                <div className="text-sm text-yellow-400 text-center">
                                    🌙 Night in progress...
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NIGHT_RESULTS && (
                                <div className="flex gap-2 justify-center">
                                    <button
                                        className={buttonTransparentStyle}
                                        onClick={async () => {
                                            // First trigger UI message clearing
                                            setClearNightMessages(true);
                                            
                                            // Then replay night in backend
                                            const updatedGame = await runGameAction(() => replayNight(game.id));
                                            if (updatedGame) {
                                                setGame(updatedGame);
                                            }
                                            
                                            // Reset the clear flag after a brief delay
                                            setTimeout(() => setClearNightMessages(false), 100);
                                        }}
                                        title="Clear night messages and replay the night phase actions"
                                    >
                                        Replay
                                    </button>
                                    <button
                                        className={buttonTransparentStyle}
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
                                    <button
                                        className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500`}
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
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NEW_DAY_BOT_SUMMARIES && (
                                <div className="text-sm text-blue-400 text-center">
                                    💭 Generating day summaries... ({game.gameStateProcessQueue.length} bots remaining)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Center column - Chat */}
            <div className="flex-1 h-full overflow-hidden px-2">
                <GameChat
                    gameId={game.id}
                    game={game}
                    onGameStateChange={setGame}
                    clearNightMessages={clearNightMessages}
                    onErrorHandled={handleErrorCleared}
                />
            </div>

            {/* Right column - Queue Info */}
            <div className="w-1/5 flex flex-col pl-2 overflow-auto">
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4">
                    <h2 className="text-lg font-bold mb-2">{queueInfo.title}</h2>
                    <p className="text-sm text-gray-300 mb-3">{queueInfo.description}</p>
                    {queueInfo.subtitle && (
                        <p className="text-xs text-gray-400 mb-3">{queueInfo.subtitle}</p>
                    )}
                    
                    {queueInfo.items.length > 0 ? (
                        <ul className="space-y-2">
                            {queueInfo.items.map((item, index) => (
                                <li
                                    key={index}
                                    className={`text-sm p-2 rounded ${
                                        item === queueInfo.currentItem 
                                            ? 'bg-blue-600 bg-opacity-50 border border-blue-400' 
                                            : 'bg-gray-700 bg-opacity-30'
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
                            <p className="text-sm text-gray-400 italic">All bots are idle</p>
                        </div>
                    )}
                    
                    {queueInfo.showProgress && queueInfo.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                            <div className="text-xs text-gray-400 mb-1">
                                Progress: {queueInfo.currentItem ? queueInfo.items.length - (queueInfo.items.indexOf(queueInfo.currentItem) + 1) : queueInfo.items.length} remaining
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${queueInfo.currentItem ? ((queueInfo.items.indexOf(queueInfo.currentItem) + 1) / queueInfo.items.length) * 100 : 0}%`
                                    }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Model Selection Dialog */}
            <ModelSelectionDialog
                isOpen={modelDialogOpen}
                onClose={() => {
                    setModelDialogOpen(false);
                    setSelectedBot(null);
                }}
                onSelect={handleModelUpdate}
                currentModel={selectedBot?.aiType || ''}
                botName={selectedBot?.name || ''}
            />
        </div>
    );
}
