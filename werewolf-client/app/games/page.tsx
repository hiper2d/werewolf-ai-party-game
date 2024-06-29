import Link from 'next/link';
import {getAllGames} from "@/app/games/actions";
import {Game} from "@/models/game";
import CreateGame from "@/app/games/components/CreateGame";
import RemoveGame from "@/app/games/components/RemoveGame";


export default async function GamePages() {
    const games: Game[] = await getAllGames();

    return(
        <div className="flex min-h-screen flex-col items-center justify-between sm:p-24 p-4">
            <div className="z-10 w-full max-w-4xl items-center justify-between text-sm lg:flex">
                <h1 className="text-4xl p-4 text-center">Game List</h1>
                <div className="bg-slate-800 p-4 rounded-lg">
                    <CreateGame/>
                    <ul>
                        {games.map((game) => (
                            <li key={game.id} className="my-4 w-full flex justify-between bg-slate-950">
                                <div className="p-4 w-full flex justify-between">
                                    <Link href={`/games/${game.id}`}>
                                        <span className="capitalize">{game.name}</span>
                                    </Link>
                                    <span>{game.description}</span>
                                </div>
                                <RemoveGame gameId={game.id}/>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>

    );
}