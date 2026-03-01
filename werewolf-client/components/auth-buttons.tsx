"use client"

import React from 'react';
import {buttonTransparentStyle} from "@/app/constants";
import {signOut, useSession} from "next-auth/react";
import {useLoginDialog} from "@/app/providers/LoginDialogProvider";

const AuthButtons = () => {
    const { data: session, status } = useSession();
    const { openLoginDialog } = useLoginDialog();

    if (status === 'unauthenticated') {
        return (
            <button onClick={() => openLoginDialog()} className={buttonTransparentStyle}>
                Login
            </button>
        );
    }

    return (
        <button onClick={() => signOut()} className={buttonTransparentStyle}>
            <span>Logout</span>
        </button>
    );
};

export default AuthButtons;