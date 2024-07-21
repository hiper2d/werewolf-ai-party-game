'use client';

import React from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';
import Link from "next/link";
import {useSession} from "next-auth/react";

const NavBar = () => {
    const { data: session, status } = useSession();

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
                {status === 'authenticated' && (
                    <span className="text-white">
                        {session.user?.name}
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