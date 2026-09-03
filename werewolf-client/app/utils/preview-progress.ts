/**
 * Progress channel for the new-game preview. previewGame is one server action that runs a
 * multi-call pipeline (casting, then character-sheet batches) for ~30-60s; server actions
 * cannot stream, so the page polls a short-lived Firestore doc instead — the same pattern
 * the draft illustrations use. The client picks the doc id (a random token) so it can only
 * read its own run, the owner email guards the read, and previewGame deletes the doc when it
 * finishes or fails, so nothing accumulates.
 */
import {db} from "@/firebase/server";
import {PreviewProgress} from "@/app/ai/preview-generation";
import {logger} from "@/app/utils/logger";

export const PREVIEW_PROGRESS_COLLECTION = 'previewProgress';

/** Client-generated token: a UUID, or anything of the same shape. Rejects everything else so
 * a crafted id can never address another collection or a foreign doc. */
export function isValidProgressId(id: unknown): id is string {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export async function writePreviewProgress(progressId: string, ownerEmail: string, progress: PreviewProgress): Promise<void> {
    if (!db) return;
    await db.collection(PREVIEW_PROGRESS_COLLECTION).doc(progressId).set({
        ...progress,
        ownerEmail,
        updatedAt: Date.now(),
    });
}

export async function deletePreviewProgress(progressId: string): Promise<void> {
    if (!db) return;
    await db.collection(PREVIEW_PROGRESS_COLLECTION).doc(progressId).delete();
}

export async function readPreviewProgress(progressId: string, ownerEmail: string): Promise<PreviewProgress | null> {
    if (!db) return null;
    const snap = await db.collection(PREVIEW_PROGRESS_COLLECTION).doc(progressId).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.ownerEmail !== ownerEmail) return null;
    return {
        stage: data.stage,
        cast: data.cast ?? [],
        batchesTotal: data.batchesTotal ?? 0,
        batchesDone: data.batchesDone ?? 0,
        writtenNames: data.writtenNames ?? [],
    };
}

/** A progress listener for generateGamePreview that writes each state fire-and-forget:
 * the indicator must never slow down or fail the generation it describes. */
export function previewProgressWriter(progressId: string, ownerEmail: string): (progress: PreviewProgress) => void {
    return (progress) => {
        writePreviewProgress(progressId, ownerEmail, progress).catch(err => {
            logger.warn(`Preview progress write failed for ${progressId}: ${err instanceof Error ? err.message : String(err)}`);
        });
    };
}
