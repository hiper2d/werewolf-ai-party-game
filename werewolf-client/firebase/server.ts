import {cert, getApps, ServiceAccount, initializeApp} from "firebase-admin/app";
import serviceAccount from "./serviceAccount.json";
import {Firestore, getFirestore } from "firebase-admin/firestore";
import {headers} from "next/headers";
import {initializeServerApp} from "@firebase/app";
import {Auth, getAuth} from "firebase/auth";
import {firebaseConfig} from "@/firebase/firebase-keys";

let db: Firestore | undefined = undefined;
let auth: Auth | undefined = undefined;
const currentApps = getApps();
if (currentApps.length <= 0) {
    if (process.env.NEXT_PUBLIC_APP_ENV === 'emulator') {
        process.env['FIRESTORE_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_URL;
        process.env['FIREBASE_AUTH_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL;
    }
    const app = initializeApp({credential: cert(serviceAccount as ServiceAccount)})
    db = getFirestore(app);
} else {
    db = getFirestore(currentApps[0]);
}

async function getAuthenticatedAppForUser() {
    const idToken = headers().get("Authorization")?.split("Bearer ")[1];

    // todo: This doesn't work with Auth Emulator
    // I haven't found yet a way to configure auth in the service worker to use emulator auth service instead of the real one
    const firebaseServerApp = initializeServerApp(
        firebaseConfig,
        idToken
            ? {
                authIdToken: idToken,
            }
            : {}
    );

    if (!auth) {
        auth = getAuth(firebaseServerApp);
        await auth.authStateReady();
    }
    return { firebaseServerApp, currentUser: auth.currentUser };
}

export { db, getAuthenticatedAppForUser };