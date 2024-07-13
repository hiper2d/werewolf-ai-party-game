'use client';

import React from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';
import {useAuth} from "@/components/auth-provider";
import Link from "next/link";

const NavBar = () => {
    const auth = useAuth();

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
                {auth?.currentUser && (
                    <span className="text-white">
                        {auth.currentUser.displayName}
                    </span>
                )}
            </div>

            <div className="flex items-center">
                <nav className="mr-8">
                    <ul className="flex space-x-4">
                        <li><Link href="/games" className="hover:text-gray-300">All games</Link></li>
                        <li className="mx-2 text-gray-500">|</li>
                        <li><Link href="/profile" className="hover:text-gray-300">User Profile</Link></li>
                    </ul>
                </nav>
                <AuthButtons />
            </div>
        </header>
    );
};

export default NavBar;