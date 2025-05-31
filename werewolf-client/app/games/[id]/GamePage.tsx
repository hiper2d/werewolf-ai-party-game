'use client';

import { useEffect, useState, useRef } from 'react';
import { getGame } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome, vote } from '@/app/api/bot-actions';
import { getPlayerColor } from "@/app/utils/color-utils";

interface Participant {
    name: string;
    role: string;
    isHuman: boolean;
    isAlive: boolean;
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

    // Handle vote state - only trigger when we have a non-empty queue AND we're in VOTE state
    useEffect(() => {
        // Only proceed if we're in VOTE state with items in queue
        if (game.gameState !== GAME_STATES.VOTE || game.gameStateProcessQueue.length === 0 || hasErrorRef.current) {
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

        const handleVote = async () => {
            console.log('🚨 CALLING VOTE API', {
                gameId: game.id,
                queue: game.gameStateProcessQueue
            });
            try {
                const updatedGame = await vote(game.id);
                console.log('✅ Vote API completed, updating game state');
                setGame(updatedGame);
            } catch (error) {
                console.error('❌ VOTE API ERROR:', {
                    error: error instanceof Error ? error.message : String(error),
                    gameState: game.gameState,
                    gameId: game.id,
                    timestamp: new Date().toISOString()
                });
                hasErrorRef.current = true;
            }
        };

        handleVote();
    }, [game.gameState, game.gameStateProcessQueue.length, game.id]); // Use queue length instead of the array itself

    // Poll for game state updates
    useEffect(() => {
        console.log('🔍 SETTING UP GAME STATE POLLING for game:', game.id);
        
        const pollInterval = setInterval(async () => {
            console.log('🔄 POLLING GAME STATE:', {
                gameId: game.id,
                currentState: game.gameState,
                timestamp: new Date().toISOString()
            });
            try {
                const updatedGame = await getGame(game.id);
                if (updatedGame) {
                    console.log('📊 Game state poll result:', {
                        oldState: game.gameState,
                        newState: updatedGame.gameState,
                        oldQueue: game.gameStateProcessQueue,
                        newQueue: updatedGame.gameStateProcessQueue,
                        stateChanged: game.gameState !== updatedGame.gameState,
                        queueChanged: JSON.stringify(game.gameStateProcessQueue) !== JSON.stringify(updatedGame.gameStateProcessQueue),
                        timestamp: new Date().toISOString()
                    });
                    
                    // Check if we're transitioning to VOTE_RESULTS
                    if (game.gameState === GAME_STATES.VOTE && updatedGame.gameState === GAME_STATES.VOTE_RESULTS) {
                        console.log('🎯 DETECTED TRANSITION TO VOTE_RESULTS:', {
                            gameId: game.id,
                            fromState: game.gameState,
                            toState: updatedGame.gameState,
                            timestamp: new Date().toISOString()
                        });
                    }
                    
                    setGame(updatedGame);
                }
            } catch (error) {
                console.error('Error polling game state:', error);
            }
        }, 5000); // Poll every 5 seconds

        return () => {
            console.log('🛑 CLEARING GAME STATE POLLING for game:', game.id);
            clearInterval(pollInterval);
        };
    }, [game.id]);

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

    // Combine human player and bots for participants list
    const participants: Participant[] = [
        { 
            name: game.humanPlayerName, 
            role: game.humanPlayerRole, 
            isHuman: true,
            isAlive: true // Human player is always considered alive
        },
        ...game.bots.map(bot => ({ 
            name: bot.name, 
            role: bot.role, 
            isHuman: false, 
            isAlive: bot.isAlive 
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
                    <div className="text-sm text-gray-400">
                        Day {game.currentDay} - {game.gameState}
                    </div>
                </div>

                {/* Participants list */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4 flex-grow overflow-auto">
                    <h2 className="text-xl font-bold mb-2">Participants</h2>
                    <ul>
                        {participants.map((participant, index) => (
                            <li 
                                key={index} 
                                className={`mb-2 flex items-center justify-between ${!participant.isHuman && !participant.isAlive ? 'opacity-50' : ''}`}
                            >
                                <span style={{ color: getPlayerColor(participant.name) }}>
                                    {participant.name}
                                    {participant.isHuman && ' (You)'}
                                </span>
                                {!participant.isAlive && (
                                    <span className="text-sm text-red-500">(Dead)</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Game controls */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4">
                    {/*<h2 className="text-xl font-bold mb-2">Game Controls</h2>*/}
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
                    </div>
                </div>
            </div>

            {/* Right column - Chat */}
            <div className="w-3/4 h-full overflow-hidden">
                <GameChat
                    gameId={game.id}
                    game={game}
                    onGameStateChange={setGame}
                />
            </div>
        </div>
    );
}