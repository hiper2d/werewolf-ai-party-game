"use client"

import {firebaseKeys} from "./firebase-keys";
import {Auth, connectAuthEmulator, getAuth} from "firebase/auth";
import {getApps, initializeApp} from "firebase/app";

let auth: Auth | undefined = undefined;

const currentApps = getApps();
if (currentApps.length <= 0) {
    const app = initializeApp(firebaseKeys);
    auth = getAuth(app);
    if (process.env.NEXT_PUBLIC_APP_ENV === 'emulator' && process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL) {
        connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL}`);
    }
} else {
    auth = getAuth(currentApps[0]);
    if (process.env.NEXT_PUBLIC_APP_ENV === 'emulator' && process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL) {
        connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL}`);
    }
}

export { auth };