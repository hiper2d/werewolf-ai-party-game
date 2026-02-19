'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';
import ThemeSwitcher from '@/app/components/ThemeSwitcher';
import Link from "next/link";
import {useSession} from "next-auth/react";

const NavBar = () => {
    const { data: session, status } = useSession();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <header className="navbar-root py-4 px-6 flex items-center justify-between h-16 sticky top-0 z-50">
            <div className="flex items-center">
                <div className="mr-4 md:mr-8 rounded-full bg-neutral-600 p-1 dark:bg-transparent dark:p-0">
                    <Image
                        src="/werewolf-ai-logo-2.png"
                        alt="Werewolf AI Logo"
                        width={50}
                        height={50}
                        className="object-contain"
                    />
                </div>
                {status === 'authenticated' && (
                    <span className="font-medium hidden sm:inline">
                        {session.user?.name}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-4">
                {/* Desktop nav */}
                <nav className="mr-4 hidden md:block">
                    <ul className="flex space-x-4">
                        <li><Link href="/games" className="nav-link">All games</Link></li>
                        <li className="mx-2 nav-divider">|</li>
                        <li><Link href="/rules" className="nav-link">Rules</Link></li>
                        <li className="mx-2 nav-divider">|</li>
                        <li><Link href="/profile" className="nav-link">User Profile</Link></li>
                    </ul>
                </nav>
                <ThemeSwitcher />
                <AuthButtons />

                {/* Mobile hamburger */}
                <button
                    className="md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                    onClick={() => setMobileMenuOpen(prev => !prev)}
                    aria-label="Toggle menu"
                >
                    {mobileMenuOpen ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile dropdown menu */}
            {mobileMenuOpen && (
                <nav className="absolute top-full left-0 right-0 navbar-root border-t theme-border px-6 py-3 md:hidden z-50">
                    <ul className="flex flex-col space-y-3">
                        <li><Link href="/games" className="nav-link block py-1" onClick={() => setMobileMenuOpen(false)}>All games</Link></li>
                        <li><Link href="/rules" className="nav-link block py-1" onClick={() => setMobileMenuOpen(false)}>Rules</Link></li>
                        <li><Link href="/profile" className="nav-link block py-1" onClick={() => setMobileMenuOpen(false)}>User Profile</Link></li>
                    </ul>
                </nav>
            )}
        </header>
    );
};

export default NavBar;
