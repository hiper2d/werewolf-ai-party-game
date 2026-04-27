"use client"

import React from 'react';
import {signOut, useSession} from "next-auth/react";
import {useLoginDialog} from "@/app/providers/LoginDialogProvider";

const AuthButtons = () => {
    const { data: session, status } = useSession();
    const { openLoginDialog } = useLoginDialog();

    if (status === 'unauthenticated') {
        return (
            <button
                onClick={() => openLoginDialog()}
                className="text-[13px] font-medium text-[var(--fg-1)] hover:text-[var(--fg-0)] px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-all duration-[120ms]"
            >
                Login
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
