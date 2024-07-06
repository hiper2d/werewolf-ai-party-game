import Link from 'next/link';
import {getAllGames} from "@/app/games/actions";
import {Game} from "@/models/game";
import RemoveGame from "@/app/games/components/RemoveGame";


export default async function GamePages() {
    const games: Game[] = await getAllGames();

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Game List</h1>
                <Link href="/games/newgame" className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl">
                    New Game
                </Link>
            </div>

            <div className="flex-grow overflow-auto">
                <ul className="space-y-2">
                    {games.map((game) => (
                        <li key={game.id} className="p-4 flex items-center justify-between rounded-lg hover:bg-white/10 transition-colors">
                            <Link href={`/games/${game.id}`} className="flex-grow">
                                <span className="text-lg capitalize text-white">{game.name}</span>
                                <p className="text-sm text-gray-300 mt-1">{game.description}</p>
                            </Link>
                            <RemoveGame gameId={game.id} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}