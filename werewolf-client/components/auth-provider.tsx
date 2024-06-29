"use client"

import { User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth"
import {useState, createContext, useContext, useEffect} from 'react';
import {auth} from "@/firebase/client";


type AuthContextType = {
    currentUser: User | null,
    isAdmin: boolean,
    loginGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: any }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    useEffect(() => {
        if (!auth) {
            return;
        }
        return auth.onAuthStateChanged(async (user) => {
            if (!user) {
                setCurrentUser(user);
            } else {
                setCurrentUser(null);
            }
        })
    }, []);

    function loginGoogle(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!auth) {
                reject();
                return;
            }
            signInWithPopup(auth, new GoogleAuthProvider())
                .then((user) => {
                    setCurrentUser(user.user);
                    resolve();
                })
                .catch((error) => {
                    console.error(error);
                    reject();
                });
        });
    }

    function logout(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!auth) {
                reject();
                return;
            }
            auth.signOut()
                .then((user) => {
                    setCurrentUser(null);
                    resolve();
                })
                .catch((error) => {
                    console.error(error);
                    reject();
                });
        })
    }

    return (
        <AuthContext.Provider value={{ currentUser, isAdmin, loginGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext)