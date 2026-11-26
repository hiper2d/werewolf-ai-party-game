/**
 * The words of the one-time note an account sees when it arrives (app/components/WelcomeNote.tsx).
 * Pure, so the wording per case is tested without a browser.
 */

/** `guest`: a guest just signed in, their game moved with them. `new`: a first sign-in with no guest game. */
export type WelcomeReason = 'guest' | 'new';

/** The part of CreditStatus (app/api/credit-actions.ts) the note reads. */
export interface WelcomeCredit {
    on: boolean;
    credits: number;
    signupDenied: boolean;
    discordUSD: number;
    discordClaimed: boolean;
}

export interface WelcomeNoteText {
    title: string;
    body: string;
    /** Text of a link to the profile page, when there is something to do there. */
    profileLink?: string;
}

const usd = (amount: number) => `$${amount.toFixed(2)}`;

export function welcomeNoteText(reason: WelcomeReason, credit: WelcomeCredit | null): WelcomeNoteText {
    const title = reason === 'guest' ? 'You’re signed in.' : 'Welcome to Werewolf AI.';
    const saved = reason === 'guest' ? 'Your game is saved to your account. ' : '';
    // Credits off, or the status could not be read: say only what is certain.
    if (!credit || !credit.on) {
        return {title, body: (saved || 'Pick a story to play your first game.').trim()};
    }
    if (credit.credits > 0) {
        return {title, body: `${saved}You have ${usd(credit.credits)} of free play.`};
    }
    if (credit.signupDenied && !credit.discordClaimed && credit.discordUSD > 0) {
        return {
            title,
            body: `${saved}This account did not get the free starting credit, because this device already has an account. You can still get ${usd(credit.discordUSD)} free on our Discord.`,
            profileLink: 'See how on your profile',
        };
    }
    return {title, body: `${saved}Your free play is used up.`, profileLink: 'Add funds or get more on your profile'};
}
