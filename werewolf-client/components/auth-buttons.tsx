"use client"

import React from 'react';
import {useAuth} from "@/components/auth-provider";
import {buttonTransparentStyle} from "@/constants";

const AuthButtons = () => {
    const auth = useAuth();

    const loginGoogle = () => {
        auth?.loginGoogle()
            .then(() => {
                console.log('Logged in');
            })
            .catch(() => {
                console.log('Failed to log in');
            })
    }

    const logout = () => {
        auth?.logout()
            .then(() => {
                console.log('Logged out');
            })
            .catch(() => {
                console.log('Failed to log out');
            })
    }

    if (!auth?.currentUser) {
        return (
            <button onClick={loginGoogle} className={buttonTransparentStyle}>
                Login
            </button>
        );
    }

    return (
        <button onClick={logout} className={buttonTransparentStyle}>
            <span>Logout</span>
        </button>
    );
};

export default AuthButtons;