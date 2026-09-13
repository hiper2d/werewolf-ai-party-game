import {db} from "@/firebase/server";
import {UserDailySpend} from "@/app/api/game-models";

/**
 * The two shared daily ledgers that sit alongside the per-user one, both carrying the
 * same `UserDailySpend` shape so `applyDailySpend` / `getFreeDailySpend` work unchanged:
 *
 *   config/globalSpend    one counter for ALL free-tier spend, platform-wide
 *   devices/{deviceId}    one counter per browser (see device-actions.ts)
 *
 * Both are written inside the `recordSpend` transaction, so a ledger can never drift
 * from the user charge it accompanies.
 *
 * CONTENTION, and when it will matter: the global counter is a single document touched
 * by every free-tier spend, and Firestore sustains roughly one write per second to one
 * document. At current volume (tens of games a day, a call every few seconds at peak)
 * that is nowhere near the ceiling. If the game ever runs hot enough to see transaction
 * retries on this doc, the fix is the standard sharded counter: write to
 * `config/globalSpend/shards/{0..9}` at random and sum the ten on read. Deliberately not
 * done now - ten reads on every guard call to solve a problem we do not have.
 */

export const GLOBAL_SPEND_DOC = 'globalSpend';
const CONFIG = 'config';
const DEVICES = 'devices';

export function globalSpendRef() {
    return db ? db.collection(CONFIG).doc(GLOBAL_SPEND_DOC) : null;
}

export function deviceSpendRef(deviceId: string) {
    return db ? db.collection(DEVICES).doc(deviceId) : null;
}

/**
 * Platform-wide free-tier ledger. A missing doc reads as nothing spent, which is the
 * correct answer on a fresh deploy and keeps the cap fail-OPEN: if this read throws, the
 * guard should let the call through rather than take the whole game down. Per-user caps
 * still apply in that window.
 */
export async function readGlobalDailySpend(): Promise<UserDailySpend | undefined> {
    const ref = globalSpendRef();
    if (!ref) {
        return undefined;
    }
    try {
        const snap = await ref.get();
        return snap.exists ? (snap.data()?.dailySpend as UserDailySpend | undefined) : undefined;
    } catch (error: any) {
        console.error(`GLOBAL_SPEND: could not read the platform ledger, allowing the call: ${error?.message ?? error}`);
        return undefined;
    }
}

/**
 * One browser's ledger plus how many accounts have used that browser. Same fail-open
 * contract as the global one.
 *
 * `userCount` is what separates "you hit your own daily cap" from "another account
 * already spent this browser's budget" in the refusal copy. Getting that distinction
 * right matters: a shared family computer is two real people, and telling the second one
 * they were caught cheating would be both wrong and insulting.
 */
export async function readDeviceRecord(deviceId: string): Promise<{ dailySpend?: UserDailySpend; userCount: number }> {
    const ref = deviceSpendRef(deviceId);
    if (!ref) {
        return { userCount: 0 };
    }
    try {
        const snap = await ref.get();
        if (!snap.exists) {
            return { userCount: 0 };
        }
        const data = snap.data() || {};
        return {
            dailySpend: data.dailySpend as UserDailySpend | undefined,
            userCount: Array.isArray(data.users) ? data.users.length : 0,
        };
    } catch (error: any) {
        console.error(`DEVICE_SPEND: could not read ledger for ${deviceId}, allowing the call: ${error?.message ?? error}`);
        return { userCount: 0 };
    }
}
