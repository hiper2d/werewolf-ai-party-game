'use server'

import {auth} from "@/auth";
import {db} from "@/firebase/server";
import {isGuestEmail} from "@/app/utils/guest";
import {logger} from "@/app/utils/logger";
import {
    parsePreviewDraft,
    PREVIEW_DRAFT_TTL_MS,
    PreviewDraftPayload,
    previewDraftsToEvict,
    PreviewDraftSummary,
    previewDraftSummaryFields,
    serializePreviewDraft,
} from "@/app/utils/preview-drafts";

/**
 * Saved previews (app/utils/preview-drafts.ts): the new-game form's generated preview, kept
 * in `gamePreviews/{id}` so a reload or another device finds it. Every call acts on the
 * session's own drafts only; a draft id from someone else reads as "not found". Results are
 * values, never thrown errors: a failed save must not break the form.
 */

const COLLECTION = 'gamePreviews';

async function sessionEmail(): Promise<string | null> {
    const session = await auth();
    const email = session?.user?.email;
    // A guest (app/utils/guest.ts) has no form, so no drafts.
    return email && !isGuestEmail(email) ? email : null;
}

export type SavePreviewDraftResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Save a preview: a new draft when `draftId` is null, otherwise that draft's new content.
 * An id that no longer exists (the game was created from it, or it was removed in another
 * tab) is NOT written again: the result is an error and the form stops saving.
 */
export async function savePreviewDraft(draftId: string | null, payload: PreviewDraftPayload): Promise<SavePreviewDraftResult> {
    try {
        const email = await sessionEmail();
        if (!email || !db) {
            return {ok: false, error: 'Not signed in'};
        }
        const data = serializePreviewDraft(payload);
        if (!data) {
            return {ok: false, error: 'This preview cannot be saved'};
        }
        const now = Date.now();
        const fields = {
            ...previewDraftSummaryFields(payload),
            data,
            updatedAt: now,
            expireAt: new Date(now + PREVIEW_DRAFT_TTL_MS),
        };
        if (draftId) {
            const ref = db.collection(COLLECTION).doc(draftId);
            const snap = await ref.get();
            if (!snap.exists || snap.data()?.ownerEmail !== email) {
                return {ok: false, error: 'Draft not found'};
            }
            await ref.update(fields);
            return {ok: true, id: draftId};
        }

        const ref = db.collection(COLLECTION).doc();
        await ref.set({...fields, ownerEmail: email, createdAt: now, env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'});
        // Keep the newest few: the oldest go when a new one is saved.
        const mine = await db.collection(COLLECTION).where('ownerEmail', '==', email).get();
        const evict = previewDraftsToEvict(mine.docs.map(doc => ({id: doc.id, updatedAt: Number(doc.data().updatedAt) || 0})));
        await Promise.all(evict.map(id => db!.collection(COLLECTION).doc(id).delete()));
        return {ok: true, id: ref.id};
    } catch (error: any) {
        logger.error(`savePreviewDraft failed: ${error?.message ?? error}`);
        return {ok: false, error: 'Could not save the draft'};
    }
}

/** The session's drafts, newest first. Expired ones are left out (and to the TTL sweep). */
export async function listPreviewDrafts(): Promise<PreviewDraftSummary[]> {
    const email = await sessionEmail();
    if (!email || !db) {
        return [];
    }
    // One equality filter and a local sort: no composite index to deploy.
    const snap = await db.collection(COLLECTION).where('ownerEmail', '==', email).get();
    const cutoff = Date.now() - PREVIEW_DRAFT_TTL_MS;
    return snap.docs
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                theme: String(data.theme ?? ''),
                name: String(data.name ?? ''),
                players: Number(data.players) || 0,
                language: String(data.language ?? 'en'),
                updatedAt: Number(data.updatedAt) || 0,
            };
        })
        .filter(draft => draft.updatedAt > cutoff)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** One of the session's drafts, or null. */
export async function getPreviewDraft(draftId: string): Promise<PreviewDraftPayload | null> {
    const email = await sessionEmail();
    if (!email || !db || typeof draftId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(draftId)) {
        return null;
    }
    const snap = await db.collection(COLLECTION).doc(draftId).get();
    const data = snap.data();
    if (!snap.exists || data?.ownerEmail !== email) {
        return null;
    }
    return parsePreviewDraft(data?.data);
}

/** Remove one of the session's drafts. True when it is gone (also when it never existed). */
export async function deletePreviewDraft(draftId: string): Promise<boolean> {
    try {
        const email = await sessionEmail();
        if (!email || !db || typeof draftId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(draftId)) {
            return false;
        }
        const ref = db.collection(COLLECTION).doc(draftId);
        const snap = await ref.get();
        if (snap.exists && snap.data()?.ownerEmail !== email) {
            return false;
        }
        await ref.delete();
        return true;
    } catch (error: any) {
        logger.error(`deletePreviewDraft failed: ${error?.message ?? error}`);
        return false;
    }
}
