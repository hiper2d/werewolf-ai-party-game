"use client"

import React from 'react';
import Link from 'next/link';
import {useAuth} from "@/components/auth-provider";

const NavBar = () => {
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

    return (
        <nav className="flex items-center bg-gray-950 text-emerald-100">
            <div className="flex-none">
                Hello,&nbsp;
                {auth?.currentUser?.displayName}
            </div>
            <div className="flex-1"></div>
            <div className="flex-none">
                {!auth?.currentUser && (
                    <button onClick={loginGoogle}>Login</button>
                )}
                {auth?.currentUser && (
                    <button onClick={logout}>Logout</button>
                )}
            </div>
        </nav>
    );
};

export default NavBar;