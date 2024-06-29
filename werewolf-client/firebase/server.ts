import {cert, getApps, ServiceAccount, initializeApp} from "firebase-admin/app";
import serviceAccount from "./serviceAccount.json";
import {Firestore, getFirestore } from "firebase-admin/firestore";
import {credentials} from "@grpc/grpc-js";
// import { getAuth } from "firebase/auth";

let db: Firestore | undefined = undefined;
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

export { db };