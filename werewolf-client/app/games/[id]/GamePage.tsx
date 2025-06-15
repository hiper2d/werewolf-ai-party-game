'use client';

import { useEffect, useState, useRef } from 'react';
import { getGame, updateBotModel, updateGameMasterModel } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import ModelSelectionDialog from "@/app/games/[id]/components/ModelSelectionDialog";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote } from '@/app/api/bot-actions';
import { replayNight } from '@/app/api/night-actions';
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
    const [modelDialogOpen, setModelDialogOpen] = useState(false);
    const [selectedBot, setSelectedBot] = useState<{ name: string; aiType: string } | null>(null);
    const [clearNightMessages, setClearNightMessages] = useState(false);

    // Handle welcome state
    useEffect(() => {
        const handleWelcome = async () => {
            if (game.gameState === GAME_STATES.WELCOME &&
                game.gameStateParamQueue.length > 0 &&
                !hasErrorRef.current) {
                try {
                    const updatedGame = await welcome(game.id);
                    setGame(updatedGame);
                } catch (error) {
                    console.error('Error sending welcome request:', error);
                    hasErrorRef.current = true;
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

    // Handle NIGHT_BEGINS state - ensure component properly reacts to state changes
    useEffect(() => {
        console.log('🌙 NIGHT_BEGINS STATE CHECK:', {
            gameState: game.gameState,
            isNightBegins: game.gameState === GAME_STATES.NIGHT_BEGINS,
            gameId: game.id,
            timestamp: new Date().toISOString()
        });
        
        // Reset error state when entering NIGHT_BEGINS or DAY_DISCUSSION to allow game reset
        if ((game.gameState === GAME_STATES.NIGHT_BEGINS || game.gameState === GAME_STATES.DAY_DISCUSSION) && hasErrorRef.current) {
            console.log(`🔄 Resetting error state for ${game.gameState}`);
            hasErrorRef.current = false;
        }
    }, [game.gameState, game.id]);

    if (!game) {
        return <div>Game not found</div>;
    }

    if (hasErrorRef.current) {
        return (
            <div className="flex h-full text-white items-center justify-center">
                <div className="bg-black bg-opacity-30 border border-red-500 border-opacity-50 rounded p-4 text-center">
                    <h2 className="text-xl font-bold mb-2">Error during bot introductions</h2>
                    <p className="text-sm text-gray-300 mb-4">Please refresh the page to try again.</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className={buttonTransparentStyle}
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        );
    }

    // Check if game is over
    const isGameOver = game.gameState === GAME_STATES.GAME_OVER;

    // Handle exit game
    const handleExitGame = () => {
        window.location.href = '/games';
    };

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
                            >
                                Exit Game
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2 justify-start">
                            {game.gameState === GAME_STATES.DAY_DISCUSSION && (
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
                                >
                                    Voting
                                </button>
                            )}
                            {game.gameState === GAME_STATES.NIGHT_BEGINS && (
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
                                >
                                    🔄 Replay Night
                                </button>
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