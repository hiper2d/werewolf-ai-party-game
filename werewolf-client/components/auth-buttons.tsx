"use client"

import React from 'react';
import { signOut, useSession } from "next-auth/react";
import { useLoginDialog } from "@/app/providers/LoginDialogProvider";

const AuthButtons = () => {
    const { data: session, status } = useSession();
    const { openLoginDialog } = useLoginDialog();

    if (status === 'unauthenticated') {
        return (
            <button onClick={() => openLoginDialog()} className="pbtn pbtn-primary pbtn-sm">
                LOGIN
            </button>
        );
    }

    return (
        <button onClick={() => signOut()} className="pbtn pbtn-ghost pbtn-sm">
            LOGOUT
        </button>
    );
};

export default AuthButtons;
