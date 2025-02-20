'use client';

import { useEffect, useState, useRef } from 'react';
import { getGame } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome } from '@/app/api/bot-actions';
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
            if (game.gameState === GAME_STATES.WELCOME && !hasErrorRef.current) {
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
    }, [game.gameState, game.id]);

    // Poll for game state updates
    useEffect(() => {
        const pollInterval = setInterval(async () => {
            try {
                const updatedGame = await getGame(game.id);
                if (updatedGame) {
                    setGame(updatedGame);
                }
            } catch (error) {
                console.error('Error polling game state:', error);
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(pollInterval);
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
                    <div className="flex gap-2 justify-evenly">
                        <button className={buttonTransparentStyle}>
                            Start
                        </button>
                        <button className={buttonTransparentStyle}>
                            Pause
                        </button>
                    </div>
                </div>
            </div>

            {/* Right column - Chat */}
            <div className="w-3/4 h-full overflow-hidden">
                <GameChat gameId={game.id} game={game} />
            </div>
        </div>
    );
}