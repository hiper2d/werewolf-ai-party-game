"use client"

import React from 'react';
import {buttonTransparentStyle} from "@/app/constants";
import {signIn, signOut, useSession} from "next-auth/react";

const AuthButtons = () => {
    const { data: session, status } = useSession();

    if (status === 'unauthenticated') {
        return (
            <button onClick={() => signIn()} className={buttonTransparentStyle}>
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