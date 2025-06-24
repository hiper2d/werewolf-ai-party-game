'use client';

import { useEffect, useState } from 'react';
import { getGame, updateBotModel, updateGameMasterModel, clearGameErrorState } from "@/app/api/game-actions";
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
            if (game.gameState === GAME_STATES.WELCOME && !game.errorState) {
                const updatedGame = await welcome(game.id);
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

    // Handle DAY_DISCUSSION state - Let GameChat handle auto-processing to avoid duplicate calls
    // This useEffect is disabled to prevent duplicate processing with GameChat
    // useEffect(() => {
    //     const handleDayDiscussion = async () => {
    //         if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
    //             game.gameStateProcessQueue.length > 0 &&
    //             !game.errorState) {
    //             console.log('🗣️ DAY_DISCUSSION: Processing bot queue...', {
    //                 queueLength: game.gameStateProcessQueue.length,
    //                 queue: game.gameStateProcessQueue
    //             });
    //             const { talkToAll } = await import("@/app/api/bot-actions");
    //             const updatedGame = await talkToAll(game.id, '');
    //             setGame(updatedGame);
    //         }
    //     };

    //     handleDayDiscussion();
    // }, [game.gameState, game.gameStateProcessQueue.length, game.gameStateProcessQueue.join(','), game.id, game.errorState]);

    // Handle NIGHT state - process night actions when in NIGHT state
    useEffect(() => {
        const handleNightAction = async () => {
            if (game.gameState === GAME_STATES.NIGHT && !game.errorState) {
                console.log('🌙 NIGHT: Processing night action...', {
                    gameState: game.gameState,
                    queueLength: game.gameStateProcessQueue.length,
                    queue: game.gameStateProcessQueue,
                    gameId: game.id
                });
                const updatedGame = await performNightAction(game.id);
                setGame(updatedGame);
            }
        };

        handleNightAction();
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
                                        const updatedGame = await performNightAction(game.id);
                                        setGame(updatedGame);
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
                    onErrorHandled={handleErrorCleared}
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