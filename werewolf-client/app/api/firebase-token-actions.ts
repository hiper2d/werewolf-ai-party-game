'use server'

import {getAuth} from "firebase-admin/auth";
import {auth} from "@/auth";
import "@/firebase/server";
import {logger} from "@/app/utils/logger";
import {firebaseUidForEmail} from "@/app/utils/firebase-uid";

/**
 * The browser's pass to Firestore (docs/plan-multiplayer.md, Design §1). Players sign in to
 * the game with NextAuth; Firestore knows nothing about that session. For a browser to
 * listen to its game directly (instead of asking this server, which the Vercel CPU budget
 * cannot carry for several players), the server mints a Firebase custom token for the
 * signed-in player and the browser exchanges it (`firebase/client.ts`).
 *
 * The uid is a hash of the email (app/utils/firebase-uid.ts).
 * A guest (app/utils/guest.ts) is a user like any other and gets one too.
 */
export type FirebaseClientTokenResult = { ok: true; token: string; uid: string } | { ok: false };

export async function getFirebaseClientToken(): Promise<FirebaseClientTokenResult> {
    try {
        const session = await auth();
        const email = session?.user?.email;
        if (!email) {
            return {ok: false};
        }
        const uid = firebaseUidForEmail(email);
        const token = await getAuth().createCustomToken(uid);
        return {ok: true, token, uid};
    } catch (error: any) {
        logger.error(`getFirebaseClientToken failed: ${error?.message ?? error}`);
        return {ok: false};
    }
}
