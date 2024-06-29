import {getGame} from "@/app/games/actions";
import GameChat from "@/app/games/[id]/components/GameChat";

export default async function GamePage({ params }: any) {
    const game = await getGame(params.id);

    if (!game) {
        return <div>Game not found</div>;
    }

    return (
        <div className="min-h-screen text-white p-4">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-4">{game.name}</h1>
                <p className="mb-6">{game.description}</p>
                <GameChat gameId={game.id}/>
            </div>
        </div>
    );
}