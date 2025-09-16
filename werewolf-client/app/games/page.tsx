import Link from 'next/link';
import {getAllGames} from "@/app/api/game-actions";
import RemoveGame from "@/app/games/components/RemoveGame";
import {redirect} from "next/navigation";
import {Game} from "@/app/api/game-models";
import { auth } from "@/auth";

function formatCreationDate(timestamp?: number): string {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

const GamePages = async () => {
    const session = await auth();
    if (!session) {
        redirect('/api/auth/signin');
    }

    const games: Game[] = await getAllGames();
    return (
        <div className="flex flex-col h-full text-white overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Game List</h1>
                <Link href="/games/newgame" className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl rounded">
                    Create Game
                </Link>
            </div>

            <div className="flex-grow overflow-auto">
                <ul className="space-y-4">
                    {games.map((game) => (
                        <li key={game.id} className="border border-white border-opacity-30 rounded-lg p-4 hover:bg-white/5 transition-colors">
                            <div className="flex justify-between items-center">
                                <Link href={`/games/${game.id}`} className="flex-grow">
                                    <div className="flex justify-between mb-1">
                                        <h2 className="text-lg capitalize text-white font-semibold">{game.theme}</h2>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">{formatCreationDate(game.createdAt)}</div>
                                            <div className="text-xs text-gray-400 mt-1">
                                                Day {game.currentDay} • {game.gameState.toLowerCase().replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-300">{game.description}</p>
                                </Link>
                                <RemoveGame gameId={game.id} />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default GamePages;
