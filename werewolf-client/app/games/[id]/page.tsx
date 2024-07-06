import { getGame } from "@/app/games/actions";
import GameChat from "@/app/games/[id]/components/GameChat";

export default async function GamePage({ params }: any) {
    const game = await getGame(params.id);

    if (!game) {
        return <div>Game not found</div>;
    }

    // Hardcoded participants for now
    const participants = ['Alice', 'Bob', 'Charlie', 'David'];

    return (
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column */}
            <div className="w-1/4 flex flex-col pr-4 overflow-auto">
                {/* Game info */}
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">{game.name}</h1>
                    <p className="text-sm text-gray-300 mb-4">{game.description}</p>
                </div>

                {/* Participants list */}
                <div className="bg-gray-800 rounded-lg p-4 mb-4 flex-grow overflow-auto">
                    <h2 className="text-xl font-bold mb-2">Participants</h2>
                    <ul>
                        {participants.map((participant, index) => (
                            <li key={index} className="mb-1">{participant}</li>
                        ))}
                    </ul>
                </div>

                {/* Game controls */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="text-xl font-bold mb-2">Game Controls</h2>
                    <div className="flex gap-2">
                        <button className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl">
                            Start
                        </button>
                        <button className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl">
                            Pause
                        </button>
                    </div>
                </div>
            </div>

            {/* Right column - Chat */}
            <div className="w-3/4 h-full overflow-hidden">
                <GameChat gameId={game.id} />
            </div>
        </div>
    );
}