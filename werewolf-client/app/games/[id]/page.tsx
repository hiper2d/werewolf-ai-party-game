import { getGame } from "@/app/api/actions";
import GameChat from "@/app/games/[id]/components/GameChat";
import {buttonTransparentStyle} from "@/app/constants";
import {getServerSession} from "next-auth";
import {redirect} from "next/navigation";

export default async function GamePage({ params }: any) {
    const session = await getServerSession();
    if (!session) {
        redirect('/api/auth/signin');
    }
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
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">{game.name}</h1>
                    <p className="text-sm text-gray-300 mb-4">{game.theme}</p>
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
                <GameChat gameId={game.id} />
            </div>
        </div>
    );
}