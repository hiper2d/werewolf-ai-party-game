'use client';

import { useEffect, useState, useRef } from 'react';
import { getGame, updateBotModel, updateGameMasterModel } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, BotResponseError } from "@/app/api/game-models";
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
    const hasErrorRef = useRef(false);
    const [errorDetails, setErrorDetails] = useState<BotResponseError | Error | null>(null);
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
                !hasErrorRef.current) {
                try {
                    const updatedGame = await welcome(game.id);
                    setGame(updatedGame);
                } catch (error) {
                    console.error('Error sending welcome request:', error);
                    hasErrorRef.current = true;
                    setErrorDetails(error instanceof Error ? error : new Error(String(error)));
                }
            }
        };

        handleWelcome();
    }, [game.gameState, game.id, game.gameStateParamQueue]);

    // Handle vote state - trigger when in VOTE state and queue changes (including when it becomes empty)
    useEffect(() => {
        // Only proceed if we're in VOTE state and no error
        if (game.gameState !== GAME_STATES.VOTE || hasErrorRef.current) {
            return;
        }

        console.log('🔍 VOTE PROCESSING CHECK:', {
            gameState: game.gameState,
            queueLength: game.gameStateProcessQueue.length,
            queue: game.gameStateProcessQueue,
            hasError: hasErrorRef.current,
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
            try {
                const updatedGame = await vote(game.id);
                console.log('✅ Vote API completed, updating game state:', {
                    oldState: game.gameState,
                    newState: updatedGame.gameState,
                    oldQueueLength: game.gameStateProcessQueue.length,
                    newQueueLength: updatedGame.gameStateProcessQueue.length
                });
                setGame(updatedGame);
            } catch (error) {
                console.error('❌ VOTE API ERROR:', {
                    error: error instanceof Error ? error.message : String(error),
                    gameState: game.gameState,
                    gameId: game.id,
                    queueLength: game.gameStateProcessQueue.length,
                    timestamp: new Date().toISOString()
                });
                hasErrorRef.current = true;
            }
        };

        handleVote();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id]);

    // Handle DAY_DISCUSSION state - process bot responses in queue
    useEffect(() => {
        const handleDayDiscussion = async () => {
            if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
                game.gameStateProcessQueue.length > 0 &&
                !hasErrorRef.current) {
                try {
                    console.log('🗣️ DAY_DISCUSSION: Processing bot queue...', {
                        queueLength: game.gameStateProcessQueue.length,
                        queue: game.gameStateProcessQueue
                    });
                    const { talkToAll } = await import("@/app/api/bot-actions");
                    const updatedGame = await talkToAll(game.id, '');
                    setGame(updatedGame);
                } catch (error) {
                    console.error('Error processing day discussion queue:', error);
                    hasErrorRef.current = true;
                }
            }
        };

        handleDayDiscussion();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id]);

    // Handle NIGHT state - process night actions when in NIGHT state
    useEffect(() => {
        const handleNightAction = async () => {
            if (game.gameState === GAME_STATES.NIGHT && !hasErrorRef.current) {
                try {
                    console.log('🌙 NIGHT: Processing night action...', {
                        gameState: game.gameState,
                        queueLength: game.gameStateProcessQueue.length,
                        queue: game.gameStateProcessQueue,
                        gameId: game.id
                    });
                    const updatedGame = await performNightAction(game.id);
                    setGame(updatedGame);
                } catch (error) {
                    console.error('Error processing night action:', error);
                    hasErrorRef.current = true;
                }
            }
        };

        handleNightAction();
    }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id]);

    // Handle state changes and error resets
    useEffect(() => {
        console.log('📊 GAME STATE CHECK:', {
            gameState: game.gameState,
            gameId: game.id,
            timestamp: new Date().toISOString()
        });
        
        // Reset error state when entering NIGHT or DAY_DISCUSSION to allow game reset
        if ((game.gameState === GAME_STATES.NIGHT || game.gameState === GAME_STATES.DAY_DISCUSSION) && hasErrorRef.current) {
            console.log(`🔄 Resetting error state for ${game.gameState}`);
            hasErrorRef.current = false;
        }
    }, [game.gameState, game.id]);

    if (!game) {
        return <div>Game not found</div>;
    }

    if (hasErrorRef.current) {
        const isBotResponseError = errorDetails instanceof BotResponseError;
        const isRecoverable = isBotResponseError ? errorDetails.recoverable : false;
        
        return (
            <div className="flex h-full text-white items-center justify-center p-4">
                <div className="bg-black bg-opacity-50 border border-red-500 border-opacity-50 rounded-lg p-6 max-w-2xl">
                    <div className="text-center mb-4">
                        <h2 className="text-xl font-bold mb-2">⚠️ Game Error</h2>
                        <p className="text-sm text-gray-300">
                            {game.gameState === GAME_STATES.WELCOME 
                                ? "Error during bot introductions" 
                                : "Error during game processing"}
                        </p>
                    </div>
                    
                    {errorDetails && (
                        <div className="mb-4 p-3 bg-red-900 bg-opacity-30 rounded border border-red-700 border-opacity-30">
                            <h3 className="text-sm font-semibold mb-2 text-red-300">Error Details:</h3>
                            <p className="text-xs text-gray-200 mb-2">{errorDetails.message}</p>
                            
                            {isBotResponseError && errorDetails.details && (
                                <div className="text-xs text-gray-300">
                                    <p className="mb-1"><span className="font-semibold">Details:</span> {errorDetails.details}</p>
                                    {errorDetails.context?.agentName && (
                                        <p className="mb-1"><span className="font-semibold">Bot:</span> {errorDetails.context.agentName}</p>
                                    )}
                                    {errorDetails.context?.model && (
                                        <p className="mb-1"><span className="font-semibold">Model:</span> {errorDetails.context.model}</p>
                                    )}
                                    {errorDetails.context?.apiProvider && (
                                        <p><span className="font-semibold">Provider:</span> {errorDetails.context.apiProvider}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="flex gap-3 justify-center">
                        {isRecoverable && (
                            <button 
                                onClick={() => {
                                    hasErrorRef.current = false;
                                    setErrorDetails(null);
                                }}
                                className={`${buttonTransparentStyle} bg-green-600 hover:bg-green-700 border-green-500`}
                            >
                                🔄 Retry
                            </button>
                        )}
                        <button 
                            onClick={() => window.location.reload()} 
                            className={buttonTransparentStyle}
                        >
                            🔃 Refresh Page
                        </button>
                        <button 
                            onClick={handleExitGame}
                            className={`${buttonTransparentStyle} bg-gray-600 hover:bg-gray-700 border-gray-500`}
                        >
                            🚪 Exit Game
                        </button>
                    </div>
                    
                    {isRecoverable && (
                        <p className="text-xs text-green-400 text-center mt-3">
                            💡 This error may be temporary. Try the retry button first.
                        </p>
                    )}
                </div>
            </div>
        );
    }

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

    return (
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column */}
            <div className="w-1/4 flex flex-col pr-4 overflow-auto">
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
                        <div className="flex gap-2 justify-start">
                            {game.gameState === GAME_STATES.DAY_DISCUSSION && (
                                <>
                                    <button
                                        className={buttonTransparentStyle}
                                        onClick={async () => {
                                            try {
                                                const updatedGame = await vote(game.id);
                                                setGame(updatedGame);
                                            } catch (error) {
                                                console.error('Error starting vote:', error);
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
                                            try {
                                                const updatedGame = await keepBotsGoing(game.id);
                                                setGame(updatedGame);
                                            } catch (error) {
                                                console.error('Error keeping bots going:', error);
                                            }
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
                                        try {
                                            const updatedGame = await performNightAction(game.id);
                                            setGame(updatedGame);
                                        } catch (error) {
                                            console.error('Error starting night:', error);
                                        }
                                    }}
                                    title="Begin the night phase where werewolves and special roles take their actions"
                                >
                                    🌙 Start Night
                                </button>
                            )}
                            {game.gameState === GAME_STATES.NIGHT && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-sm text-yellow-400 text-center">
                                        🌙 Night in progress...
                                    </div>
                                    <button
                                        className={`${buttonTransparentStyle} bg-purple-600 hover:bg-purple-700 border-purple-500`}
                                        onClick={async () => {
                                            try {
                                                // First trigger UI message clearing
                                                setClearNightMessages(true);
                                                
                                                // Then replay night in backend
                                                const updatedGame = await replayNight(game.id);
                                                setGame(updatedGame);
                                                
                                                // Reset the clear flag after a brief delay
                                                setTimeout(() => setClearNightMessages(false), 100);
                                            } catch (error) {
                                                console.error('Error replaying night:', error);
                                                setClearNightMessages(false);
                                            }
                                        }}
                                        title="Clear night messages and replay the night phase actions"
                                    >
                                        🔄 Replay Night
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right column - Chat */}
            <div className="w-3/4 h-full overflow-hidden">
                <GameChat
                    gameId={game.id}
                    game={game}
                    onGameStateChange={setGame}
                    clearNightMessages={clearNightMessages}
                />
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