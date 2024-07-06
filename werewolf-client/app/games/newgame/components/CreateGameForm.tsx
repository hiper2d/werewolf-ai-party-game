'use client';

import React, { useState } from 'react';
import { useRouter } from "next/navigation";
import { createGame } from "@/app/games/actions";
import { Game } from "@/models/game";

export default function CreateGameForm() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        try {
            const newGame = new Game('', name, description);
            await createGame(newGame.toFirestore());

            setName('');
            setDescription('');
            router.push("/games");
        } catch (err: any) {
            setError(err.message);
            console.error("Error creating game:", err);
        }
    }

    return (
        <form id="create-game-form" onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 text-black">
                <input
                    className="p-3 border rounded"
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <input
                    className="p-3 border rounded"
                    placeholder="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>
            {error && <p className="text-red-500 mt-2">{error}</p>}
        </form>
    );
}