'use client';

import React, { useEffect, useState } from 'react';
import AuthButtons from '@/components/auth-buttons';
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getUserTier } from '@/app/api/user-actions';
import type { UserTier } from '@/app/api/game-models';
import CampfireSprite from '@/components/sprites/CampfireSprite';

const tierBadge: Record<UserTier, { label: string; color: string }> = {
    free: { label: 'FREE', color: 'var(--ember-ink-3)' },
    api: { label: 'API', color: 'var(--ember-team-village)' },
    paid: { label: 'PAID', color: 'var(--ember-moon-2)' },
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
        <header
            style={{
                background: '#050510',
                borderBottom: '2px solid var(--ember-border)',
                height: 52,
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                position: 'sticky',
                top: 0,
                zIndex: 50,
            }}
        >
            {/* Logo + brand */}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <div
                    style={{
                        width: 32, height: 32,
                        background: 'var(--ember-bg-3)',
                        border: '2px solid var(--ember-fire-3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 8px rgba(240,122,34,0.4)',
                        overflow: 'hidden',
                    }}
                >
                    <CampfireSprite scale={1.2} />
                </div>
                <div className="pixel-text" style={{ fontSize: 12, color: 'var(--ember-ink-0)' }}>
                    WEREWOLF<span style={{ color: 'var(--ember-fire-4)' }}>.AI</span>
                </div>
            </Link>

            <div style={{ flex: 1 }} />

            {/* Desktop nav links */}
            <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 14 }}>
                <Link href="/games" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, textDecoration: 'none' }}>
                    ALL GAMES
                </Link>
                <span style={{ color: 'var(--ember-border)' }}>|</span>
                <Link href="/rules" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, textDecoration: 'none' }}>
                    RULES
                </Link>
                <span style={{ color: 'var(--ember-border)' }}>|</span>
                <Link href="/profile" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, textDecoration: 'none' }}>
                    PROFILE
                </Link>
            </nav>

            {/* User info (desktop) */}
            {status === 'authenticated' && (
                <>
                    <div className="hidden md:block" style={{ width: 1, height: 24, background: 'var(--ember-border)' }} />
                    <div className="hidden md:flex" style={{ alignItems: 'center', gap: 8 }}>
                        <div
                            style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--ember-fire-3), var(--ember-fire-1))',
                                border: '2px solid var(--ember-fire-4)',
                            }}
                        />
                        <div>
                            <div className="pixel-text" style={{ fontSize: 8, color: 'var(--ember-ink-0)' }}>
                                {(session.user?.name || '').toUpperCase().slice(0, 12)}
                            </div>
                            {userTier && (
                                <div
                                    className="console-text"
                                    style={{ fontSize: 11, color: tierBadge[userTier].color }}
                                >
                                    {tierBadge[userTier].label} TIER
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Auth button */}
            <AuthButtons />

            {/* Mobile hamburger */}
            <button
                className="pbtn pbtn-ghost pbtn-sm md:hidden"
                style={{ padding: '6px 10px' }}
                onClick={() => setMobileMenuOpen(prev => !prev)}
                aria-label="Toggle menu"
            >
                {mobileMenuOpen ? '✕' : '☰'} MENU
            </button>

            {/* Mobile dropdown */}
            {mobileMenuOpen && (
                <nav
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0, right: 0,
                        background: '#050510',
                        borderTop: '2px solid var(--ember-border)',
                        padding: '12px 16px',
                        zIndex: 50,
                    }}
                    className="md:hidden"
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Link href="/games" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, padding: '6px 0', textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                            ALL GAMES
                        </Link>
                        <Link href="/rules" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, padding: '6px 0', textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                            RULES
                        </Link>
                        <Link href="/profile" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-2)', letterSpacing: 1, padding: '6px 0', textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                            PROFILE
                        </Link>
                        {status === 'authenticated' && userTier && (
                            <div style={{ borderTop: '1px solid var(--ember-border)', paddingTop: 8, marginTop: 4 }}>
                                <span className="pixel-text" style={{ fontSize: 8, color: 'var(--ember-ink-0)' }}>
                                    {(session?.user?.name || '').toUpperCase()}
                                </span>
                                <span className="console-text" style={{ fontSize: 11, color: tierBadge[userTier].color, marginLeft: 8 }}>
                                    {tierBadge[userTier].label}
                                </span>
                            </div>
                        )}
                    </div>
                </nav>
            )}
        </header>
    );
};

export default NavBar;
