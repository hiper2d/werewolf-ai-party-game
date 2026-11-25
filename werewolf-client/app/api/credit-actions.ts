'use server';

import {auth} from "@/auth";
import {db} from "@/firebase/server";
import {ensureCredits, getClaimCode} from "@/app/api/credits";
import {getFreeTierLimits} from "@/app/api/limits-actions";
import {isGuestEmail} from "@/app/utils/guest";

/**
 * Free credits, the calls a browser may make (app/utils/credits.ts). Every one reads the
 * account from the session and takes no argument that names one.
 */

export interface CreditStatus {
    /** False with credits switched off (`config/limits.creditsOn: 0`): the old daily caps apply. */
    on: boolean;
    /** Free credits left, USD. */
    credits: number;
    /** What the sign-up credit was. 0 when it was not given. */
    signupUSD: number;
    /** True when the sign-up credit was not given because the device already had an account. */
    signupDenied: boolean;
    /** What the Discord claim gives, and whether this account has used it. */
    discordUSD: number;
    discordClaimed: boolean;
}

async function sessionEmail(): Promise<string | undefined> {
    const email = (await auth())?.user?.email ?? undefined;
    return email && !isGuestEmail(email) ? email : undefined;
}

/**
 * Decide the signed-in account's sign-up credit if it is still open. Called by
 * DeviceProvider right after `registerDevice`, which is the first moment the browser the
 * account signed up on is known. Returns nothing: the page reads `getCreditStatus`.
 */
export async function settleSignupCredit(): Promise<void> {
    const email = await sessionEmail();
    if (!email) return;
    try {
        await ensureCredits(email);
    } catch (error: any) {
        console.error(`settleSignupCredit failed: ${error?.message ?? error}`);
    }
}

/** The signed-in account's credits, for the profile page and the out-of-credits popup. Null for a guest or a visitor. */
export async function getCreditStatus(): Promise<CreditStatus | null> {
    const email = await sessionEmail();
    if (!email || !db) return null;
    const limits = await getFreeTierLimits();
    const credits = limits.creditsOn ? await ensureCredits(email) : undefined;
    const user = (await db.collection('users').doc(email).get()).data() || {};
    return {
        on: !!limits.creditsOn,
        credits: credits ?? 0,
        signupUSD: Number(user.signupCreditInfo?.amountUSD) || 0,
        signupDenied: user.signupCreditStatus === 'denied',
        discordUSD: limits.discordCreditUSD,
        discordClaimed: !!user.discordCredit,
    };
}

/** The signed-in account's personal code for the Discord claim (made on first ask). */
export async function getDiscordClaimCode(): Promise<string | null> {
    const email = await sessionEmail();
    if (!email) return null;
    try {
        return await getClaimCode(email);
    } catch (error: any) {
        console.error(`getDiscordClaimCode failed: ${error?.message ?? error}`);
        return null;
    }
}
