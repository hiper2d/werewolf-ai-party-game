import {cert, getApps, initializeApp, ServiceAccount} from "firebase-admin/app";
import {Firestore, getFirestore} from "firebase-admin/firestore";

let db: Firestore | undefined = undefined;

const getServiceAccount = (): ServiceAccount => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Missing Firebase credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required");
    }

    return { projectId, clientEmail, privateKey };
};

const currentApps = getApps();
if (currentApps.length <= 0) {
    if (process.env.NEXT_PUBLIC_APP_ENV === 'emulator') {
        process.env['FIRESTORE_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_URL;
        process.env['FIREBASE_AUTH_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL;
    }
    const app = initializeApp({credential: cert(getServiceAccount())});
    db = getFirestore(app);
} else {
    db = getFirestore(currentApps[0]);
}

export { db };