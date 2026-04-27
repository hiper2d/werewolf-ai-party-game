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
        <header className="navbar-root h-14 px-6 flex items-center justify-between sticky top-0 z-50">
            {/* Left cluster: logo + name */}
            <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[var(--radius-sm)] overflow-hidden flex-none">
                        <Image
                            src="/werewolf-ai-logo-2.png"
                            alt="Werewolf AI Logo"
                            width={28}
                            height={28}
                            className="object-contain"
                        />
                    </div>
                </Link>
                {status === 'authenticated' && (
                    <Link href="/" className="text-[13px] font-medium text-[var(--fg-0)] hover:text-[var(--fg-1)] transition-colors duration-[120ms] hidden sm:flex items-center gap-2">
                        {session.user?.name}
                        {userTier && (
                            <span className={`text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded ${tierConfig[userTier].className}`}>
                                {tierConfig[userTier].label}
                            </span>
                        )}
                    </Link>
                )}
            </div>

            {/* Right cluster: nav + theme + auth */}
            <div className="flex items-center gap-3">
                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-1 mr-2">
                    <Link href="/games" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]">
                        All games
                    </Link>
                    <span className="w-px h-4 bg-[var(--line-2)]"></span>
                    <Link href="/rules" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]">
                        Rules
                    </Link>
                    <span className="w-px h-4 bg-[var(--line-2)]"></span>
                    <Link href="/profile" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]">
                        Profile
                    </Link>
                </nav>
                <ThemeSwitcher />
                <AuthButtons />

                {/* Mobile hamburger */}
                <button
                    className="md:hidden p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-3)] text-[var(--fg-1)] transition-colors duration-[120ms]"
                    onClick={() => setMobileMenuOpen(prev => !prev)}
                    aria-label="Toggle menu"
                >
                    {mobileMenuOpen ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile dropdown menu */}
            {mobileMenuOpen && (
                <nav className="absolute top-full left-0 right-0 bg-[var(--bg-1)] border-t border-[var(--line-1)] px-6 py-3 md:hidden z-50 shadow-subtle">
                    <ul className="flex flex-col space-y-1">
                        <li><Link href="/games" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] block py-2 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]" onClick={() => setMobileMenuOpen(false)}>All games</Link></li>
                        <li><Link href="/rules" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] block py-2 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]" onClick={() => setMobileMenuOpen(false)}>Rules</Link></li>
                        <li><Link href="/profile" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] block py-2 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]" onClick={() => setMobileMenuOpen(false)}>Profile</Link></li>
                    </ul>
                </nav>
            )}
        </header>
    );
};

export default NavBar;
