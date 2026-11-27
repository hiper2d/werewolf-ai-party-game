"use client"

import type {FirebaseApp} from "firebase/app";
import type {Auth} from "firebase/auth";
import type {Firestore} from "firebase/firestore";
import {getFirebaseClientToken} from "@/app/api/firebase-token-actions";

/**
 * The browser's own connection to Firestore (docs/plan-multiplayer.md, Design §1): what a
 * game page will listen on instead of asking the server after every move. Nothing reads
 * through it yet; `firestore.rules` denies everything until the listeners are built.
 *
 * The config is the project's public web config (it is in every Firebase web page, by
 * design: access is decided by the rules, not by these values). NEXT_PUBLIC_FIREBASE_*
 * override it, for a second project.
 *
 * The SDK is loaded on first use, not with the page: it is large, and most pages never
 * need it.
 */
const FIREBASE_WEB_CONFIG = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCXxGSur-IOQGDOlNVPa6GBqvAXjhPcrDg',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'werewolf-ai-party-game.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'werewolf-ai-party-game',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:193889850746:web:b18268d5fccdb6549af2c3',
};

export interface FirebaseClient {
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    /** The signed-in player's Firebase uid (a hash of the email, see firebase-token-actions). */
    uid: string;
}

let pending: Promise<FirebaseClient | null> | null = null;

/**
 * The connection, signed in as the current player. Null when there is no session or the
 * sign-in failed: callers fall back to asking the server, as before. One sign-in per page
 * load; the SDK renews its own token after that. A different player in the same tab (sign
 * out, sign in) gets a new sign-in because the uid no longer matches.
 */
export function getFirebaseClient(): Promise<FirebaseClient | null> {
    if (!pending) {
        pending = connect().catch(error => {
            console.error('Firebase client sign-in failed', error);
            return null;
        });
        // A failure is not remembered: the next caller tries again.
        pending.then(client => { if (!client) pending = null; });
    }
    return pending;
}

async function connect(): Promise<FirebaseClient | null> {
    const pass = await getFirebaseClientToken();
    if (!pass.ok) {
        return null;
    }
    const [{getApps, initializeApp}, {getAuth, signInWithCustomToken}, {getFirestore}] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
    ]);
    const app = getApps()[0] ?? initializeApp(FIREBASE_WEB_CONFIG);
    const auth = getAuth(app);
    if (auth.currentUser?.uid !== pass.uid) {
        await signInWithCustomToken(auth, pass.token);
    }
    return {app, auth, db: getFirestore(app), uid: pass.uid};
}

/** Forget the connection (after a sign-out), so the next player signs in as themselves. */
export async function resetFirebaseClient(): Promise<void> {
    const current = pending;
    pending = null;
    const client = await current?.catch(() => null);
    if (client) {
        const {signOut} = await import("firebase/auth");
        await signOut(client.auth).catch(() => undefined);
    }
}
