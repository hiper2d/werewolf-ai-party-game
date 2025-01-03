'use client';

import { useEffect, useState, useRef } from 'react';
import { getGame } from "@/app/api/game-actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES } from "@/app/api/game-models";
import type { Game } from "@/app/api/game-models";
import type { Session } from "next-auth";
import { welcome } from '@/app/api/bot-actions';

export default function GamePage({ 
    initialGame, 
    session 
}: { 
    initialGame: Game, 
    session: Session | null 
}) {
    const [game, setGame] = useState(initialGame);
    const hasErrorRef = useRef(false);

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
    }, [game.gameStateParamQueue.length]);

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

    // Hardcoded participants for now
    const participants = ['Alice', 'Bob', 'Charlie', 'David'];

    return (
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column */}
            <div className="w-1/4 flex flex-col pr-4 overflow-auto">
                {/* Game info */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">{game.theme}</h1>
                    <p className="text-sm text-gray-300 mb-4">{game.description}</p>
                </div>

                {/* Participants list */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4 flex-grow overflow-auto">
                    <h2 className="text-xl font-bold mb-2">Participants</h2>
                    <ul>
                        {participants.map((participant, index) => (
                            <li key={index} className="mb-1">{participant}</li>
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
                <GameChat gameId={game.id} gameState={game.gameState} />
            </div>
        </div>
    );
}