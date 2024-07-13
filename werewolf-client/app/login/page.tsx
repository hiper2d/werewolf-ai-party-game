'use client';

import React from 'react';
import AuthButtons from '@/components/auth-buttons';
import { useAuth } from "@/components/auth-provider";
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const LoginPage = () => {
    const auth = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (auth?.currentUser) {
            router.push('/games');
        }
    }, [auth?.currentUser, router]);

    return (
        <div className="flex items-center justify-center border border-white border-opacity-30">
            <div className="p-8 rounded-lg shadow-lg text-center">
                <h1 className="text-3xl mb-4 text-white">Welcome to Werewolf AI</h1>
                <p className="mb-6 text-gray-300">Please log in to continue</p>
                <AuthButtons />
            </div>
        </div>
    );
};

export default LoginPage;