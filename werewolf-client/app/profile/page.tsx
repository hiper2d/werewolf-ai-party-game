import React from 'react';
import {buttonBlackStyle} from "@/constants";

export default function UserProfilePage() {
    // Placeholder user data - replace this with actual user data fetching logic
    const user = {
        name: "John Doe",
        email: "john.doe@example.com",
        gamesPlayed: 15,
        winRate: "60%"
    };

    return (
        <div className="flex flex-col w-full h-full p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">User Profile</h1>
                <button className={buttonBlackStyle}>
                    Edit Profile
                </button>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <div className="mb-4">
                    <h2 className="text-xl font-semibold text-white mb-2">Personal Information</h2>
                    <p className="text-gray-300">Name: {user.name}</p>
                    <p className="text-gray-300">Email: {user.email}</p>
                </div>

                <div className="mb-4">
                    <h2 className="text-xl font-semibold text-white mb-2">Game Statistics</h2>
                    <p className="text-gray-300">Games Played: {user.gamesPlayed}</p>
                    <p className="text-gray-300">Win Rate: {user.winRate}</p>
                </div>
            </div>
        </div>
    );
}