import {createHash} from "crypto";

/**
 * A player's Firebase uid (app/api/firebase-token-actions.ts): a hash of the email, not the
 * email, because it appears in Firestore rules and in documents other seats can read.
 * Server side only.
 */
export function firebaseUidForEmail(email: string): string {
    return 'u_' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40);
}
