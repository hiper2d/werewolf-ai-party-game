'use client';

import { useEffect, useState } from 'react';
import { getGame, updateBotModel, updateGameMasterModel, clearGameErrorState, setGameErrorState, endNight, summarizeCurrentDay, newDayBegins } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote, keepBotsGoing } from '@/app/api/bot-actions';
import { replayNight, performNightAction } from '@/app/api/night-actions';
import { getPlayerColor } from "@/app/utils/color-utils";

interface Participant {
    name: string;
    role: string;
    isHuman: boolean;
    isAlive: boolean;
    aiType?: string;
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
    const [selectedBot, setSelectedBot] = useState<{ name: string; aiType: string } | null>(null);
    const [clearNightMessages, setClearNightMessages] = useState(false);

    // Handle exit game
    const handleExitGame = () => {
        window.location.href = '/games';
    };

    // Handle welcome state
    useEffect(() => {
        const handleWelcome = async () => {
            if (game.gameState === GAME_STATES.WELCOME &&
                game.gameStateParamQueue.length > 0 &&
                !game.errorState) {
                console.log('🎭 GAMEPAGE: CALLING WELCOME API for bot introductions:', {
                    gameId: game.id,
                    paramQueue: game.gameStateParamQueue,
                    timestamp: new Date().toISOString()
                });
                const updatedGame = await welcome(game.id);
                console.log('✅ GAMEPAGE: Welcome API completed');
                setGame(updatedGame);
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
            const updatedGame = await vote(game.id);
            console.log('✅ Vote API completed, updating game state:', {
                oldState: game.gameState,
                newState: updatedGame.gameState,
                oldQueueLength: game.gameStateProcessQueue.length,
                newQueueLength: updatedGame.gameStateProcessQueue.length
            });
            setGame(updatedGame);
        };

        handleVote();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);

    // Handle NIGHT state - process night actions when in NIGHT state
    useEffect(() => {
        const handleNightAction = async () => {
            if (game.gameState === GAME_STATES.NIGHT && 
                game.gameStateProcessQueue.length > 0 && 
                !game.errorState) {
                
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
                const updatedGame = await performNightAction(game.id);
                console.log('✅ GAMEPAGE: PerformNightAction API completed');
                setGame(updatedGame);
            }
        };

        handleNightAction();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.gameStateParamQueue.length, game.gameStateParamQueue.join(','), game.humanPlayerRole, game.humanPlayerName, game.id, game.errorState]);

    // Handle NIGHT_ENDS_SUMMARY state - automatically process bot summaries
    useEffect(() => {
        const handleSummaryGeneration = async () => {
            if (game.gameState === GAME_STATES.NIGHT_ENDS_SUMMARY && 
                game.gameStateProcessQueue.length > 0 && 
                !game.errorState) {
                
                console.log('💭 GAMEPAGE: AUTO-PROCESS SUMMARY CHECK:', {
                    gameState: game.gameState,
                    queueLength: game.gameStateProcessQueue.length,
                    queue: game.gameStateProcessQueue,
                    gameId: game.id,
                    timestamp: new Date().toISOString()
                });
                
                try {
                    const updatedGame = await summarizeCurrentDay(game.id);
                    console.log('✅ GAMEPAGE: SummarizeCurrentDay API completed');
                    setGame(updatedGame);
                } catch (error: any) {
                    console.error('💭 GAMEPAGE: SummarizeCurrentDay failed:', error);
                    
                    // Set error state so user can see the issue and take action
                    const errorState = {
                        message: `Failed to generate summary: ${error.message}`,
                        details: error.details || 'Summary generation encountered an error',
                        context: error.context || {},
                        recoverable: error.recoverable !== false // Default to recoverable unless explicitly set to false
                    };
                    
                    try {
                        const gameWithError = await setGameErrorState(game.id, errorState);
                        setGame(gameWithError);
                    } catch (setErrorError) {
                        console.error('💭 GAMEPAGE: Failed to set error state:', setErrorError);
                        // Fallback: just log the error if we can't set the error state
                    }
                }
            }
        };

        handleSummaryGeneration();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);

    // Handle NEW_DAY_BEGINS state - automatically start the new day
    useEffect(() => {
        const handleNewDayBegins = async () => {
            if (game.gameState === GAME_STATES.NEW_DAY_BEGINS && !game.errorState) {
                console.log('🌅 GAMEPAGE: AUTO-PROCESS NEW DAY CHECK:', {
                    gameState: game.gameState,
                    gameId: game.id,
                    timestamp: new Date().toISOString()
                });
                
                try {
                    const updatedGame = await newDayBegins(game.id);
                    console.log('✅ GAMEPAGE: NewDayBegins API completed');
                    setGame(updatedGame);
                } catch (error: any) {
                    console.error('🌅 GAMEPAGE: NewDayBegins failed:', error);
                    
                    // Set error state so user can see the issue and take action
                    const errorState = {
                        message: `Failed to start new day: ${error.message}`,
                        details: error.details || 'New day transition encountered an error',
                        context: error.context || {},
                        recoverable: error.recoverable !== false // Default to recoverable unless explicitly set to false
                    };
                    
                    try {
                        const gameWithError = await setGameErrorState(game.id, errorState);
                        setGame(gameWithError);
                    } catch (setErrorError) {
                        console.error('🌅 GAMEPAGE: Failed to set error state:', setErrorError);
                        // Fallback: just log the error if we can't set the error state
                    }
                }
            }
        };

        handleNewDayBegins();
    }, [game.gameState, game.id, game.errorState]);

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
            const updatedGame = await clearGameErrorState(game.id);
            setGame(updatedGame);
        } catch (error) {
            console.error('Failed to clear error state:', error);
        }
    };

    // Check if game is over
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER;

    // Handle model update
    const handleModelUpdate = async (newModel: string) => {
        if (!selectedBot) return;
        
        try {
            let updatedGame;
            if (selectedBot.name === 'Game Master') {
                updatedGame = await updateGameMasterModel(game.id, newModel);
            } else {
                updatedGame = await updateBotModel(game.id, selectedBot.name, newModel);
            }
            setGame(updatedGame);
        } catch (error) {
            console.error('Error updating model:', error);
            throw error;
        }
    };

    const openModelDialog = (botName: string, currentModel: string) => {
        setSelectedBot({ name: botName, aiType: currentModel });
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
            aiType: bot.aiType
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
                return {
                    title: "🌙 Night Actions",
                    description: currentRole ? `Current: ${currentRole}` : "No night actions currently",
                    items: paramQueue,
                    currentItem: currentPlayer || null,
                    showProgress: paramQueue.length > 0,
                    subtitle: currentRole ? `Role: ${currentRole}` : undefined
                };
            case GAME_STATES.NIGHT_ENDS_SUMMARY:
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
            case GAME_STATES.NIGHT_ENDS:
                return {
                    title: "🌅 Night Complete",
                    description: "Night phase finished",
                    items: [],
                    currentItem: null,
                    showProgress: false
                };
            case GAME_STATES.NEW_DAY_BEGINS:
                return {
                    title: "🌅 New Day Starting",
                    description: "Transitioning to new day...",
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
                    <div className="text-xs">
                        <button
                            onClick={() => openModelDialog('Game Master', game.gameMasterAiType)}
                            className="text-gray-500 hover:text-gray-300 transition-colors duration-200"
                            title="Click to change Game Master AI model"
                        >
                            Game Master Model: {game.gameMasterAiType}
                        </button>
                    </div>
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
                                    {!participant.isAlive && (
                                        <span className="text-sm text-red-400">💀 Eliminated</span>
                                    )}
                                </div>
                                {/* Show AI model for all bots */}
                                {!participant.isHuman && participant.aiType && (
                                    <div className="text-xs mt-1 ml-2">
                                        <button
                                            onClick={() => openModelDialog(participant.name, participant.aiType!)}
                                            className="text-gray-500 hover:text-gray-300 transition-colors duration-200"
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
                                            const updatedGame = await vote(game.id);
                                            setGame(updatedGame);
                                        }}
                                        title="Start the voting phase to eliminate a suspected werewolf"
                                    >
                                        Vote
                                    </button>
                                    <button
                                        className={`${buttonTransparentStyle} ${game.gameStateProcessQueue.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={game.gameStateProcessQueue.length > 0}
                                        onClick={async () => {
                                            const updatedGame = await keepBotsGoing(game.id);
                                            setGame(updatedGame);
                                        }}
                                        title={game.gameStateProcessQueue.length > 0 ? 'Bots are already talking' : 'Let 1-3 bots continue the conversation'}
                                    >
                                        Keep Going
                                    </button>
                                </>
                            )}
                            {game.gameState === GAME_STATES.VOTE_RESULTS && (
                                <button
                                    className={`${buttonTransparentStyle} bg-blue-600 hover:bg-blue-700 border-blue-500`}
                                    onClick={async () => {
                                        console.log('🌙 GAMEPAGE: START NIGHT BUTTON CLICKED:', {
                                            gameId: game.id,
                                            currentState: game.gameState,
                                            timestamp: new Date().toISOString()
                                        });
                                        const updatedGame = await performNightAction(game.id);
                                        console.log('✅ GAMEPAGE: Start Night button - PerformNightAction API completed');
                                        setGame(updatedGame);
                                    }}
                                    title="Begin the night phase where werewolves and special roles take their actions"
                                >
                                    🌙 Start Night
                                </button>
                            )}
                            {(game.gameState === GAME_STATES.NIGHT || game.gameState === GAME_STATES.NIGHT_ENDS) && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-sm text-yellow-400 text-center">
                                        {game.gameState === GAME_STATES.NIGHT_ENDS ? '🌅 Night completed' : '🌙 Night in progress...'}
                                    </div>
                                    <div className="flex gap-2 justify-center">
                                        <button
                                            className={`${buttonTransparentStyle} bg-purple-600 hover:bg-purple-700 border-purple-500`}
                                            onClick={async () => {
                                                // First trigger UI message clearing
                                                setClearNightMessages(true);
                                                
                                                // Then replay night in backend
                                                const updatedGame = await replayNight(game.id);
                                                setGame(updatedGame);
                                                
                                                // Reset the clear flag after a brief delay
                                                setTimeout(() => setClearNightMessages(false), 100);
                                            }}
                                            title="Clear night messages and replay the night phase actions"
                                        >
                                            🔄 Replay Night
                                        </button>
                                        {game.gameState === GAME_STATES.NIGHT_ENDS && (
                                            <button
                                                className={`${buttonTransparentStyle} bg-green-600 hover:bg-green-700 border-green-500`}
                                                onClick={async () => {
                                                    const updatedGame = await endNight(game.id);
                                                    setGame(updatedGame);
                                                }}
                                                title="Start the next day and begin discussion phase"
                                            >
                                                🌅 Start Next Day
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NIGHT_ENDS_SUMMARY && (
                                <div className="text-sm text-blue-400 text-center">
                                    💭 Generating day summaries... ({game.gameStateProcessQueue.length} bots remaining)
                                </div>
                            )}
                            {game.gameState === GAME_STATES.NEW_DAY_BEGINS && (
                                <div className="text-sm text-green-400 text-center">
                                    🌅 Starting Day {(game.currentDay || 1) + 1}...
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
                                Progress: {queueInfo.items.length - (queueInfo.items.indexOf(queueInfo.currentItem) + 1)} remaining
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${((queueInfo.items.indexOf(queueInfo.currentItem) + 1) / queueInfo.items.length) * 100}%`
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