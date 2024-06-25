import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { firebaseKeys } from "./firebase-keys";
import { getAuth } from "firebase/auth";

const app = initializeApp(firebaseKeys);
const db = getFirestore(app);

if (process.env.NEXT_PUBLIC_APP_ENV === 'emulator') {
    // Setting env vars works only with some Admin SDK which I have no idea about
    // process.env['FIRESTORE_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_URL;
    // process.env['FIREBASE_AUTH_EMULATOR_HOST'] = process.env.NEXT_PUBLIC_EMULATOR_FIREBASE_AUTH_URL;

    // This works for me though:
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    // Read more about this here: https://firebase.google.com/docs/emulator-suite/connect_firestore
}
const auth = getAuth(app);

export { db, auth };