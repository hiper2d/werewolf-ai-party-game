import React from 'react';
import CreateGameForm from './components/CreateGameForm';

export default function CreateNewGamePage() {
    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Game</h1>
                <button className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl" form="create-game-form" type="submit">
                    Create
                </button>
            </div>

            <CreateGameForm />
        </div>
    );
}