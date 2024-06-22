'use client';

import {useState} from 'react';
import {createGame} from "@/app/games/actions";
import {useRouter} from "next/navigation";
import {Game} from "@/models/game";

export default function CreateGame() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function submit() {
        try {
            const newGame = new Game('', name, description);
            await createGame(newGame.toFirestore());

            setName('');
            setDescription('');

            router.refresh();
            router.push("/games");
        } catch (err: any) {
            setError(err.message);
            console.error("Error creating game:", err);
        }
    }

    return (
        <form className="grid grid-cols-6 items-center text-black" onSubmit={submit}>
            <input
                className="col-span-2 p-3 border"
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <input
                className="col-span-3 p-3 border mx-3"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <button className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl" type="submit">+</button>
            {error && <p className="col-span-6 text-red-500 mt-2">{error}</p>}
        </form>
    );
}