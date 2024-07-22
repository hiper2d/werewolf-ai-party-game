import React from 'react';
import CreateGameForm from './components/CreateGameForm';
import {buttonBlackStyle} from "@/constants";
import {getServerSession} from "next-auth";
import {redirect} from "next/navigation";

export default async function CreateNewGamePage() {
    const session = await getServerSession();
    if (!session) {
        redirect('/api/auth/signin');
    }

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Create New Game</h1>
                <button className={buttonBlackStyle} form="create-game-form" type="submit">
                    Create
                </button>
            </div>

            <CreateGameForm/>
        </div>
    );
}