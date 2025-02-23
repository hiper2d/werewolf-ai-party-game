'use client';

import {removeGameById} from "@/app/api/game-actions";
import {useRouter} from "next/navigation";

interface RemoveGameProps {
    gameId: string
}

export default function RemoveGame({gameId}: RemoveGameProps) {
    const router = useRouter();

    async function removeGame() {
        await removeGameById(gameId);
        router.refresh();
    }

    return (
        <button className="ml-8 p-4 border-l-2 border-white border-opacity-30 hover:bg-slate-900 w-16" onClick={removeGame}>
            X
        </button>
    );
}