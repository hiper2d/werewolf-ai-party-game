'use client';

import {useAuth} from "@/components/auth-provider";
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

const ProtectedRoute = (WrappedComponent: React.ComponentType) => {
    return (props: any) => {
        const auth = useAuth();
        const router = useRouter();

        useEffect(() => {
            if (auth?.currentUser === null) {
                router.push('/login');
            }
        }, [auth?.currentUser, router]);

        if (auth?.currentUser === null) {
            return null; // or a loading spinner
        }

        return <WrappedComponent {...props} />;
    };
};

export default ProtectedRoute;