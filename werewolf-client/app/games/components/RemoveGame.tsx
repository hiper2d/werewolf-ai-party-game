'use client';

import {remove} from "@/app/games/actions";
import {useRouter} from "next/navigation";

interface RemoveGameProps {
    gameId: string
}

export default function RemoveGame({gameId}: RemoveGameProps) {
    const router = useRouter();

    async function removeGame() {
        await remove(gameId);
        router.refresh();
    }

    return (
        <button className="ml-8 p-4 border-l-2 border-slate-900 hover:bg-slate-900 w-16" onClick={removeGame}>
            X
        </button>
    );
}