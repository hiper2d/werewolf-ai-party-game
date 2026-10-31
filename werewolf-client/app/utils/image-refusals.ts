import {firestore} from "firebase-admin";
import {isImageRefusalError} from "@hiper2d/ai-agents/images";
import {ImageRefusal, ImageRefusalKind} from "@/app/api/game-models";
import {logger} from "@/app/utils/logger";

/**
 * Durable record of an image model's refusal. A text refusal writes a provider block on the
 * game, but an image safety block (HTTP 400 or an `image_safety` / `image_prohibited_content`
 * step) only reached the logs, which keep three days — on 2026-10-30 the 10-13 refusals could
 * not be reconstructed from the database. The content screen's image probabilities
 * (`jevScreenCalls.imageRefusal` / `imagePerson`) are meant to be read against real refusals
 * before any bar moves, so every refusal is appended to `games/{id}.imageRefusals`.
 *
 * Never throws; returns whether the error was a refusal at all (callers already branch on
 * that for their own logging).
 */
export async function recordImageRefusal(
    gameRef: firestore.DocumentReference,
    kind: ImageRefusalKind,
    error: unknown,
    extra: {day?: number} = {},
): Promise<boolean> {
    if (!isImageRefusalError(error)) return false;
    const message = String((error as {message?: unknown})?.message ?? error).slice(0, 300);
    const entry: ImageRefusal = {kind, at: Date.now(), message, ...(extra.day !== undefined ? {day: extra.day} : {})};
    try {
        await gameRef.update({imageRefusals: firestore.FieldValue.arrayUnion(entry)});
    } catch (e: unknown) {
        // A deleted game or a transient write failure: the log line still has it.
        logger.warn(`Could not record an image refusal on ${gameRef.id}`, {gameId: gameRef.id, kind, error: (e as Error)?.message});
    }
    return true;
}
