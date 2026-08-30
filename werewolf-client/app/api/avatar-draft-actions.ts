'use server'

import {after} from "next/server";
import {auth} from "@/auth";
import {AvatarDraftSpec, AvatarDraftState, USER_TIERS} from "@/app/api/game-models";
import {getUserBalance, getUserTier} from "@/app/api/user-actions";
import {getDraftState, normalizeDraftSpec, runDraftGeneration, startDraftGeneration} from "@/app/utils/avatar-drafts";
import {logger} from "@/app/utils/logger";

/**
 * Paid tier only: draws the story illustration and every character portrait
 * for the game being previewed, before it exists. Returns as soon as the draw
 * is claimed; the client polls getAvatarDraft until it lands. A second call
 * for the same cast while a set exists appends candidates (a "redraw"); a
 * call for a different cast starts a fresh set. A call while a draw is in
 * flight is a no-op that reports the in-flight state — the double-click and
 * the second tab both land here.
 *
 * Billed at draw time like every other image (cost + markup off the balance);
 * createGame later adopts the set without charging again.
 */
export async function generateDraftIllustrations(spec: AvatarDraftSpec): Promise<AvatarDraftState> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    const userEmail = session.user.email;
    const tier = await getUserTier(userEmail);
    if (tier !== USER_TIERS.PAID) {
        throw new Error('Drawing illustrations on the preview is a paid feature.');
    }
    const balance = await getUserBalance(userEmail);
    if (balance <= 0) {
        throw new Error('Insufficient balance. Please add funds on your profile page to draw illustrations.');
    }

    const {subject, keys} = normalizeDraftSpec(spec);
    const claim = await startDraftGeneration(userEmail, subject, keys);
    if (!claim.claimed) return claim.state;

    const run = () => runDraftGeneration(userEmail, subject, claim).catch(error =>
        logger.error(`Illustration draft kickoff failed`, {error: error.message})
    );
    try {
        after(run);
    } catch {
        // Outside a request scope (unit tests, scripts): draw inline.
        await run();
    }
    return claim.state;
}

/** The current user's draft, for the preview page's polling. */
export async function getAvatarDraft(): Promise<AvatarDraftState | null> {
    const session = await auth();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    return getDraftState(session.user.email);
}
