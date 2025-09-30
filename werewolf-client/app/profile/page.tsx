import React from 'react';
import {redirect} from "next/navigation";
import {buttonTransparentStyle} from "@/app/constants";
import Image from 'next/image';
import ApiKeyManagement from './components/ApiKeyManagement';
import FreeUserLimits from './components/FreeUserLimits';
import {getUserApiKeys, getUser} from "@/app/api/user-actions";
import { auth } from "@/auth";

export default async function UserProfilePage() {
    const session = await auth();
    if (!session) {
        redirect('/api/auth/signin');
    }

    let user = null;
    let apiKeys = {};
    let userTier: 'free' | 'api' = 'free';

    try {
        user = await getUser(session.user?.email!);
        apiKeys = await getUserApiKeys(session.user?.email!);
        userTier = user?.tier || 'free';
    } catch (error) {
        console.error('Error fetching user data:', error);
        // User might not exist yet, use defaults
        userTier = 'free';
    }

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
                        <p className="mt-2">
                            <span className="font-semibold">Tier: </span>
                            <span className={userTier === 'api' ? 'text-green-400' : 'text-yellow-400'}>
                                {userTier.toUpperCase()}
                            </span>
                        </p>
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

            {/* Right column - Tier-based content */}
            <div className="w-3/4 h-full overflow-hidden">
                <div className="h-full flex flex-col bg-black bg-opacity-30 border border-white border-opacity-30 rounded">
                    {userTier === 'api' ? (
                        <ApiKeyManagement initialApiKeys={apiKeys} userId={session.user?.email!} />
                    ) : (
                        <FreeUserLimits userId={session.user?.email!} />
                    )}
                </div>
            </div>
        </div>
    );
}
