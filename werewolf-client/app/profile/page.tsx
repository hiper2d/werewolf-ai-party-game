import React from 'react';
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { buttonTransparentStyle } from "@/constants";
import Image from 'next/image';
import ApiKeyList from './components/ApiKeyList';
import AddApiKeyForm from './components/AddApiKeyForm';
import {getUserApiKeys} from "@/app/api/actions";

export default async function UserProfilePage() {
    const session = await getServerSession();
    if (!session) {
        redirect('/api/auth/signin');
    }

    const apiKeys = await getUserApiKeys(session.user?.email!);

    return (
        <div className="flex h-full text-white overflow-hidden">
            {/* Left column */}
            <div className="w-1/4 flex flex-col pr-4 overflow-auto">
                {/* User info */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">User Profile</h1>
                    <div className="text-sm text-gray-300 mb-2">
                        <Image src={session.user?.image ?? '/mememan.webp'} width="100" height="100" alt="User profile" className="rounded-full" />
                    </div>
                    <div className="text-sm text-gray-300 mb-2">
                        <p>Name: {session.user?.name}</p>
                        <p>Email: {session.user?.email}</p>
                    </div>
                </div>

                {/* Game Statistics */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4 mb-4 flex-grow overflow-auto">
                    <h2 className="text-xl font-bold mb-2">Game Statistics</h2>
                    <ul>
                        <li className="mb-1">Games Played: 0</li>
                        <li className="mb-1">Win Rate: 0%</li>
                    </ul>
                </div>

                {/* Profile controls */}
                <div className="bg-black bg-opacity-30 border border-white border-opacity-30 rounded p-4">
                    <div className="flex gap-2 justify-evenly">
                        <button className={buttonTransparentStyle}>
                            Edit Profile
                        </button>
                    </div>
                </div>
            </div>

            {/* Right column - API Key Management */}
            <div className="w-3/4 h-full overflow-hidden">
                <div className="h-full flex flex-col bg-black bg-opacity-30 border border-white border-opacity-30 rounded">
                    <div className="p-4">
                        <h2 className="text-2xl font-bold mb-4">API Keys</h2>
                    </div>

                    <div className="flex-grow overflow-auto p-4">
                        <ApiKeyList initialApiKeys={apiKeys} userId={session.user?.email!}/>
                    </div>

                    <div className="p-4 border-t border-white border-opacity-30">
                        <AddApiKeyForm userId={session.user?.email!}/>
                    </div>
                </div>
            </div>
        </div>
    );
}
