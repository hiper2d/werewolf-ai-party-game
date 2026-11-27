import {GamePreviewWithGeneratedBots} from "@/app/api/game-models";

/**
 * Saved previews (docs/plan-multiplayer.md, step 1). A generated preview used to live only
 * in the browser that made it: a reload lost the cast and the story the player had paid
 * for. Since 2026-11-26 the new-game form saves it as a draft the moment it is generated
 * (`gamePreviews/{id}`, written by `app/api/preview-draft-actions.ts`) and after every edit,
 * the game list shows the drafts, and opening one puts the form back as it was. Create
 * removes the draft. This file is the pure part: the shapes, the limits and the checks.
 *
 * A draft is the owner's own text going back to the owner, so nothing in it is screened
 * here: `createGame` screens and validates the cast when a game is made from it, exactly
 * as it does for a preview that was never saved.
 */

/** The form's fields above the preview, as the player left them. */
export interface PreviewDraftForm {
    name: string;
    theme: string;
    description: string;
    language: string;
    artStyle: string;
    playerCount: number;
    werewolfCount: number;
    specialRoles: string[];
    humanPlayerRole: string;
    longReplies: boolean;
    gameMode: string;
    gameMasterAiType: string;
    voiceProvider: string;
    playersAiType: string[];
}

export interface PreviewDraftPayload {
    form: PreviewDraftForm;
    /** The preview with the player's edits. */
    preview: GamePreviewWithGeneratedBots;
    /** The preview as generated: what the edits are counted against at Create. */
    baseline: GamePreviewWithGeneratedBots | null;
}

/** A row in the game list. */
export interface PreviewDraftSummary {
    id: string;
    theme: string;
    name: string;
    players: number;
    language: string;
    updatedAt: number;
}

/** A player keeps this many drafts; saving one more removes the oldest. */
export const MAX_PREVIEW_DRAFTS = 10;
/** A draft nobody touched for this long is gone, like a game. */
export const PREVIEW_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Firestore's document limit is 1 MiB; a 16-player preview is about 30 KB. */
export const MAX_PREVIEW_DRAFT_CHARS = 400_000;

/**
 * The payload as the string that is stored, or null when it is not a preview or is too big.
 * Stored as one JSON string: a preview has optional fields all over, and Firestore refuses
 * `undefined` values.
 */
export function serializePreviewDraft(payload: unknown): string | null {
    if (!isPreviewDraftPayload(payload)) {
        return null;
    }
    let json: string;
    try {
        json = JSON.stringify({form: payload.form, preview: payload.preview, baseline: payload.baseline ?? null});
    } catch {
        return null;
    }
    return json.length <= MAX_PREVIEW_DRAFT_CHARS ? json : null;
}

/** The stored string back as a payload, or null when it does not read as one. */
export function parsePreviewDraft(json: unknown): PreviewDraftPayload | null {
    if (typeof json !== 'string') {
        return null;
    }
    try {
        const parsed = JSON.parse(json);
        return isPreviewDraftPayload(parsed) ? {form: parsed.form, preview: parsed.preview, baseline: parsed.baseline ?? null} : null;
    } catch {
        return null;
    }
}

function isPreviewDraftPayload(value: unknown): value is PreviewDraftPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const {form, preview} = value as {form?: any; preview?: any};
    return !!form && typeof form === 'object'
        && typeof form.name === 'string' && typeof form.theme === 'string'
        && !!preview && typeof preview === 'object'
        && typeof preview.scene === 'string' && Array.isArray(preview.bots) && preview.bots.length > 0;
}

/** The list row for a payload. */
export function previewDraftSummaryFields(payload: PreviewDraftPayload): Omit<PreviewDraftSummary, 'id' | 'updatedAt'> {
    return {
        theme: String(payload.preview.theme ?? payload.form.theme).slice(0, 200),
        name: String(payload.preview.name ?? payload.form.name).slice(0, 60),
        players: payload.preview.bots.length + 1,
        language: String(payload.preview.language ?? payload.form.language ?? 'en').slice(0, 8),
    };
}

/** Which of a player's drafts to remove so that at most `keep` are left: the oldest. */
export function previewDraftsToEvict(drafts: Array<{id: string; updatedAt: number}>, keep: number = MAX_PREVIEW_DRAFTS): string[] {
    return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(keep).map(draft => draft.id);
}
