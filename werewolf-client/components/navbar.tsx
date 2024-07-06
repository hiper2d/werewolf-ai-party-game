import React from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';

const NavBar = () => {
    return (
        <header className="bg-gray-900 text-white py-4 px-6 flex items-center justify-between h-16">
            <div className="flex items-center">
                <div className="mr-8">
                    <Image
                        src="/werewolf-ai-logo-2.png"
                        alt="Werewolf AI Logo"
                        width={50}
                        height={50}
                        className="object-contain"
                    />
                </div>

                <nav>
                    <ul className="flex space-x-4">
                        <li><a href="/games" className="hover:text-gray-300">All games</a></li>
                        <li className="mx-2 text-gray-500">|</li>
                        <li><a href="/profile" className="hover:text-gray-300">User Profile</a></li>
                    </ul>
                </nav>
            </div>

            <AuthButtons />
        </header>
    );
};

export default NavBar;