"use client"

import React from 'react';
import {signOut, useSession} from "next-auth/react";
import {useLoginDialog} from "@/app/providers/LoginDialogProvider";
import {isGuestEmail} from "@/app/utils/guest";

const AuthButtons = () => {
    const { data: session, status } = useSession();
    const { openLoginDialog } = useLoginDialog();

    // A guest (app/utils/guest.ts) has a session but no account: for them the button is
    // the way IN, and it brings them back to the page (their game) they are on.
    const isGuest = isGuestEmail(session?.user?.email);
    if (status === 'unauthenticated' || isGuest) {
        return (
            <button
                onClick={() => openLoginDialog(isGuest ? window.location.pathname : undefined)}
                className="text-[13px] font-medium text-[var(--fg-1)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]"
            >
                {isGuest ? 'Sign in' : 'Login'}
            </button>
        );
    }

    return (
        <button
            onClick={() => signOut()}
            className="text-[13px] font-medium text-[var(--fg-2)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]"
        >
            Logout
        </button>
    );
};

export default AuthButtons;
