"use client"

import React from 'react';
import { useAuth } from "@/components/auth-provider";

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

    const buttonStyle = "bg-gray-900 text-gray-300 border border-white px-3 py-2 rounded hover:bg-gray-700 transition-colors";

    if (!auth?.currentUser) {
        return (
            <button onClick={loginGoogle} className={buttonStyle}>
                Login
            </button>
        );
    }

    return (
        <button onClick={logout} className={buttonStyle}>
            <span>Logout</span>
        </button>
    );
};

export default AuthButtons;