'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import AuthButtons from '@/components/auth-buttons';
import ThemeSwitcher from '@/app/components/ThemeSwitcher';
import Link from "next/link";
import {useSession} from "next-auth/react";
import { getUserTier } from '@/app/api/user-actions';
import type { UserTier } from '@/app/api/game-models';

const tierConfig: Record<UserTier, { label: string; className: string }> = {
    free: { label: 'Free', className: 'border border-[var(--line-2)] text-[var(--fg-2)]' },
    api: { label: 'API', className: 'border border-[var(--line-2)] text-[var(--fg-2)]' },
    paid: { label: 'Paid', className: 'border border-[var(--accent-line)] text-[var(--accent)]' },
};

const NavBar = () => {
    const { data: session, status } = useSession();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userTier, setUserTier] = useState<UserTier | null>(null);

    useEffect(() => {
        if (status === 'authenticated' && session?.user?.email) {
            getUserTier(session.user.email).then(setUserTier).catch(() => {});
        }
    }, [status, session?.user?.email]);

    return (
        <header className="navbar-root py-4 px-6 flex items-center justify-between h-16 sticky top-0 z-50">
            <div className="flex items-center">
                <Link href="/" className="mr-4 md:mr-8 rounded-full logo-backdrop-sm">
                    <Image
                        src="/werewolf-ai-logo-2.png"
                        alt="Werewolf AI Logo"
                        width={50}
                        height={50}
                        className="object-contain"
                    />
                </Link>
                {status === 'authenticated' && (
                    <Link href="/" className="font-medium hidden sm:inline hover:opacity-80 transition-opacity">
                        {session.user?.name}
                        {userTier && (
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${tierConfig[userTier].className}`}>
                                {tierConfig[userTier].label}
                            </span>
                        )}
                    </Link>
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
                    className="md:hidden p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-3)] transition-colors duration-[120ms]"
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
                <nav className="absolute top-full left-0 right-0 navbar-root border-t border-[var(--line-1)] px-6 py-3 md:hidden z-50">
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
