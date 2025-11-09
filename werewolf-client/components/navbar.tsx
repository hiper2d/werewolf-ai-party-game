'use client';

import React from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';
import Link from "next/link";
import {useSession} from "next-auth/react";

const NavBar = () => {
    const { data: session, status } = useSession();

    return (
        <header className="navbar-root py-4 px-6 flex items-center justify-between h-16">
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

            <div className="flex items-center gap-4">
                <nav className="mr-4">
                    <ul className="flex space-x-4">
                        <li><Link href="/games" className="nav-link">All games</Link></li>
                        <li className="mx-2 nav-divider">|</li>
                        <li><Link href="/profile" className="nav-link">User Profile</Link></li>
                    </ul>
                </nav>
                <AuthButtons />
            </div>
        </header>
    );
};

export default NavBar;
