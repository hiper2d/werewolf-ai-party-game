import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {
    AVATAR_DRAFT_IN_PROGRESS,
    AVATAR_DRAFTS_COLLECTION,
    AVATAR_VARIANTS_COLLECTION,
    AvatarDraft,
    AvatarDraftSpec,
    AvatarDraftState,
    Game,
    USER_TIERS,
    UserTier,
} from "@/app/api/game-models";
import {
    AvatarSubject,
    AvatarVariantMap,
    billImages,
    commitChunked,
    drawIllustrationSet,
    PendingWrite,
    portraitKeysFor,
    recordAbandonedSpend,
    runAvatarGeneration,
    sceneWritesFor,
    SpendLedger,
    STALE_REGEN_MS,
    writeCandidates,
} from "@/app/utils/avatar-generation";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {API_KEY_CONSTANTS} from "@/app/ai/ai-models";
import {sanitizePlayerName} from "@/app/utils/name-utils";
import {sanitizeArtStyle} from "@/app/utils/art-style";
import {logger} from "@/app/utils/logger";

/**
 * Paid-tier illustration drafts: the set a player draws on the new-game
 * preview, before the game exists. Storage mirrors a game (avatars +
 * avatarVariants subcollections under one parent doc) so createGame adopts a
 * draft by copying docs, and every reader downstream is unchanged.
 *
 * One draft per user, addressed by email — two tabs contend on one doc and the
 * claim transaction prevents double-charging. Drafts carry `expireAt` (parent
 * and image docs) for a Firestore TTL policy; adoption deletes them eagerly.
 */

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// The grid tops out at 4x4 cells: bots + the human + the Game Master.
const MAX_DRAFT_BOTS = 14;
const round6 = (n: number) => parseFloat(n.toFixed(6));

export function avatarDraftIdFor(email: string): string {
    return Buffer.from(email).toString('base64url');
}

function draftRefFor(email: string): firestore.DocumentReference {
    if (!db) throw new Error('Firestore is not initialized');
    return db.collection(AVATAR_DRAFTS_COLLECTION).doc(avatarDraftIdFor(email));
}

export function sameKeySet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort(), sb = [...b].sort();
    return sa.every((k, i) => k === sb[i]);
}

/** Server-side gate for what the preview page sends: names take the same
 * canonical form createGame enforces (that is what makes the draft's keys
 * comparable to the game's), lengths are capped, and duplicates are refused
 * because two characters can't share one portrait doc. */
export function normalizeDraftSpec(spec: AvatarDraftSpec): {subject: AvatarSubject; keys: string[]} {
    if (!spec || typeof spec !== 'object') throw new Error('Invalid illustration request');
    const theme = String(spec.theme ?? '').trim().slice(0, 200);
    if (!theme) throw new Error('A theme is required to draw illustrations');
    const description = String(spec.description ?? '').trim().slice(0, 4000);
    const humanPlayerName = sanitizePlayerName(String(spec.humanPlayerName ?? ''));
    if (!humanPlayerName) throw new Error('Your name must contain at least one letter or number.');
    if (!Array.isArray(spec.bots) || spec.bots.length === 0 || spec.bots.length > MAX_DRAFT_BOTS) {
        throw new Error('Invalid player list');
    }
    const bots = spec.bots.map(bot => {
        const name = sanitizePlayerName(String(bot?.name ?? ''));
        if (!name) throw new Error(`Player name "${bot?.name}" must contain at least one letter or number.`);
        const visualDescription = String(bot?.visualDescription ?? '').trim().slice(0, 600);
        return {
            name,
            gender: bot?.gender === 'female' ? 'female' : 'male',
            story: String(bot?.story ?? '').trim().slice(0, 1000),
            ...(visualDescription ? {visualDescription} : {}),
        };
    });
    const artStyle = sanitizeArtStyle(spec.artStyle);
    const subject: AvatarSubject = {theme, description, humanPlayerName, bots, ...(artStyle ? {artStyle} : {})};
    const keys = portraitKeysFor(subject);
    if (new Set(keys).size !== keys.length) throw new Error('Player names must be unique');
    return {subject, keys};
}

function stateFrom(draft: AvatarDraft): AvatarDraftState {
    // A run that died mid-flight leaves 'generating' behind forever; past the
    // stale window the client should stop waiting for it.
    const stale = draft.status === 'generating' && !!draft.generatingAt && Date.now() - draft.generatingAt >= STALE_REGEN_MS;
    return {
        status: stale ? 'failed' : draft.status,
        version: draft.version,
        keys: draft.keys ?? [],
        avatarVariants: draft.avatarVariants ?? {},
        avatarVersions: draft.avatarVersions ?? {},
        hasScene: !!draft.hasScene,
        stages: draft.stages ?? {portraits: false, scene: false},
        ...(stale ? {error: 'Drawing timed out.'} : draft.error ? {error: draft.error} : {}),
    };
}

export async function getDraftState(userEmail: string): Promise<AvatarDraftState | null> {
    const snap = await draftRefFor(userEmail).get();
    if (!snap.exists) return null;
    return stateFrom(snap.data() as AvatarDraft);
}

export interface DraftClaim {
    claimed: boolean;
    state: AvatarDraftState;
    // A redraw of the same cast appends candidates (old faces stay switchable
    // in the game); a different cast starts a fresh set.
    append: boolean;
    existingVariants: AvatarVariantMap;
    existingHasScene: boolean;
}

/** Claims the user's draft for a draw, or reports the run already in flight.
 * The transaction is what keeps two tabs from paying for two grids. */
export async function startDraftGeneration(userEmail: string, subject: AvatarSubject, keys: string[]): Promise<DraftClaim> {
    if (!db) throw new Error('Firestore is not initialized');
    const draftRef = draftRefFor(userEmail);
    const now = Date.now();

    return db.runTransaction(async tx => {
        const snap = await tx.get(draftRef);
        const existing = snap.exists ? (snap.data() as AvatarDraft) : null;
        if (existing && existing.status === 'generating' && existing.generatingAt && now - existing.generatingAt < STALE_REGEN_MS) {
            return {claimed: false, state: stateFrom(existing), append: false, existingVariants: {}, existingHasScene: false};
        }
        const append = !!existing && existing.status === 'ready' && sameKeySet(existing.keys ?? [], keys);
        const draft: AvatarDraft = {
            ownerEmail: userEmail,
            status: 'generating',
            version: append ? existing!.version : AVATAR_DRAFT_IN_PROGRESS,
            keys,
            avatarVariants: append ? existing!.avatarVariants : {},
            avatarVersions: append ? existing!.avatarVersions : {},
            hasScene: append ? existing!.hasScene : false,
            stages: {portraits: false, scene: false},
            generatingAt: now,
            totalCostUSD: append ? existing!.totalCostUSD : 0,
        };
        // set(), not update(): a fresh set must also drop a previous run's error.
        tx.set(draftRef, {...draft, expireAt: firestore.Timestamp.fromMillis(now + DRAFT_TTL_MS)});
        return {
            claimed: true,
            state: stateFrom(draft),
            append,
            existingVariants: append ? existing!.avatarVariants : {},
            existingHasScene: append ? existing!.hasScene : false,
        };
    });
}

/** The draw itself; runs after the claim, off the request (next/server after()). */
export async function runDraftGeneration(userEmail: string, subject: AvatarSubject, claim: DraftClaim): Promise<void> {
    const draftRef = draftRefFor(userEmail);
    const logContext = {draft: draftRef.id, append: claim.append};
    const ledger: SpendLedger = {spentUSD: 0};
    let tier: UserTier = USER_TIERS.FREE;

    try {
        // A new cast: the previous set's docs would otherwise linger beside
        // the new ones (different keys) until the TTL sweeps them.
        if (!claim.append) await deleteDraftImages(draftRef);

        const keys = await getUserTierAndApiKeys(userEmail);
        tier = keys.tier;
        const apiKey = keys.apiKeys[API_KEY_CONSTANTS.GOOGLE];
        if (!apiKey) throw new Error('No Google API key available for illustration generation');

        const expireAt = firestore.Timestamp.fromMillis(Date.now() + DRAFT_TTL_MS);
        const drawn = await drawIllustrationSet(apiKey, subject, {
            withScenes: true,
            ledger,
            logContext,
            onStage: async stage => {
                await draftRef.update({[`stages.${stage}`]: true});
            },
        });
        const {variants, versions} = await writeCandidates(
            draftRef, drawn.portraits, claim.existingVariants, sceneWritesFor(draftRef, drawn.scenes, {expireAt}), {expireAt},
        );

        const costUSD = round6(ledger.spentUSD);
        await draftRef.update({
            status: 'ready',
            version: Date.now(),
            avatarVariants: variants,
            avatarVersions: versions,
            hasScene: drawn.scenes.length > 0 || claim.existingHasScene,
            generatingAt: null,
            totalCostUSD: firestore.FieldValue.increment(costUSD),
            error: firestore.FieldValue.delete(),
        });
        ledger.spentUSD = 0;

        await billImages(userEmail, tier, costUSD);
        logger.info(`Illustration draft drawn`, {...logContext, portraits: Object.keys(variants).length, scenes: drawn.scenes.length, costUSD});
    } catch (error: any) {
        logger.error(`Illustration draft failed`, {...logContext, error: error.message, costUSD: ledger.spentUSD});
        // A failed redraw keeps the set the player already has; only a first
        // draw with nothing to fall back on reads as failed.
        const hadSet = Object.keys(claim.existingVariants).length > 0;
        await draftRef.update({
            status: hadSet ? 'ready' : 'failed',
            generatingAt: null,
            error: String(error?.message ?? 'Drawing failed').slice(0, 300),
        }).catch(updateError => logger.error(`Illustration draft status update failed`, {...logContext, error: updateError.message}));
        await recordAbandonedSpend(draftRef, userEmail, tier, ledger.spentUSD, `draft ${draftRef.id}`, ['totalCostUSD']);
    }
}

async function deleteDraftImages(draftRef: firestore.DocumentReference): Promise<void> {
    for (const collection of ['avatars', AVATAR_VARIANTS_COLLECTION]) {
        const snapshot = await draftRef.collection(collection).get();
        await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
    }
}

export async function deleteDraft(draftRef: firestore.DocumentReference): Promise<void> {
    await deleteDraftImages(draftRef);
    await draftRef.delete();
}

// ---------------------------------------------------------------------------
// Adoption into a game (createGame)
// ---------------------------------------------------------------------------

export interface DraftAdoption {
    ref: firestore.DocumentReference;
    draft: AvatarDraft;
    // 'ready' copies now; 'in-progress' means the game is created as
    // 'generating' and the set is copied when it lands.
    mode: 'ready' | 'in-progress';
}

/**
 * Whether the user's draft can become this game's illustration set. The cast
 * must match key for key — a renamed character would otherwise wear a
 * stranger's face — and a ready set must be the version the client saw, so a
 * set redrawn in another tab isn't attached unseen. `requestedVersion` is
 * AVATAR_DRAFT_IN_PROGRESS when the client left while the set was still
 * being drawn; that adopts whatever lands, as long as the cast matches.
 */
export async function findAdoptableDraft(userEmail: string, requestedVersion: number | undefined, gameKeys: string[]): Promise<DraftAdoption | null> {
    if (requestedVersion === undefined || requestedVersion === null) return null;
    const ref = draftRefFor(userEmail);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const draft = snap.data() as AvatarDraft;
    if (draft.ownerEmail !== userEmail) return null;
    if (!sameKeySet(draft.keys ?? [], gameKeys)) {
        logger.warn(`Illustration draft skipped: cast changed since it was drawn`, {draft: ref.id, draftKeys: draft.keys, gameKeys});
        return null;
    }
    if (draft.status === 'ready') {
        if (requestedVersion !== AVATAR_DRAFT_IN_PROGRESS && draft.version !== requestedVersion) {
            logger.warn(`Illustration draft skipped: version mismatch`, {draft: ref.id, requestedVersion, draftVersion: draft.version});
            return null;
        }
        return {ref, draft, mode: 'ready'};
    }
    if (draft.status === 'generating' && draft.generatingAt && Date.now() - draft.generatingAt < STALE_REGEN_MS) {
        return {ref, draft, mode: 'in-progress'};
    }
    return null;
}

export type AdoptedAvatarFields = Pick<Game, 'avatarsStatus' | 'avatarsVersion' | 'avatarVariants' | 'avatarVersions'> & {imagesCostUSD: number};

/** Copies the draft's image docs into the game's subcollections (orphan-safe:
 * the game doc may not exist yet) and returns the game fields that make them
 * live. Billing happened at draw time; only the bookkeeping moves. */
export async function copyDraftIntoGame(draftRef: firestore.DocumentReference, gameRef: firestore.DocumentReference): Promise<AdoptedAvatarFields> {
    const draft = (await draftRef.get()).data() as AvatarDraft | undefined;
    if (!draft || draft.status !== 'ready') throw new Error('Illustration draft is not ready');

    const writes: PendingWrite[] = [];
    for (const collection of ['avatars', AVATAR_VARIANTS_COLLECTION]) {
        const snapshot = await draftRef.collection(collection).get();
        for (const doc of snapshot.docs) {
            // The draft's TTL field must not follow the image into the game.
            const {expireAt: _ttl, ...data} = doc.data();
            void _ttl;
            writes.push({ref: gameRef.collection(collection).doc(doc.id), data});
        }
    }
    await commitChunked(writes);

    return {
        avatarsStatus: 'ready',
        avatarsVersion: draft.version,
        avatarVariants: draft.avatarVariants ?? {},
        avatarVersions: draft.avatarVersions ?? {},
        imagesCostUSD: draft.totalCostUSD ?? 0,
    };
}

/**
 * Follow-up for a game created while its draft was still being drawn: waits
 * for the draft to land, then adopts it. If the draft fails (or the wait runs
 * out), the game draws its own set the ordinary way — the player asked for
 * illustrations and gets them either way. Runs off the request, like the
 * creation-time kickoff.
 */
export async function adoptDraftWhenReady(gameId: string, userEmail: string, gameKeys: string[]): Promise<void> {
    if (!db) throw new Error('Firestore is not initialized');
    const gameRef = db.collection('games').doc(gameId);
    const draftRef = draftRefFor(userEmail);

    let abandonedCostUSD = 0;
    for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const snap = await draftRef.get();
        const draft = snap.exists ? (snap.data() as AvatarDraft) : null;
        if (!draft || draft.ownerEmail !== userEmail || !sameKeySet(draft.keys ?? [], gameKeys)) break;
        if (draft.status === 'ready') {
            try {
                const adopted = await copyDraftIntoGame(draftRef, gameRef);
                const {imagesCostUSD, ...fields} = adopted;
                // Only a game still waiting on this draft takes the copy; a
                // status changed underneath means something else owns it now.
                const applied = await db.runTransaction(async tx => {
                    const gameSnap = await tx.get(gameRef);
                    const g = gameSnap.exists ? (gameSnap.data() as Game) : null;
                    if (!g || g.ownerEmail !== userEmail || g.avatarsStatus !== 'generating') return false;
                    tx.update(gameRef, {
                        ...fields,
                        totalGameCost: firestore.FieldValue.increment(imagesCostUSD),
                        totalImagesCost: firestore.FieldValue.increment(imagesCostUSD),
                    });
                    return true;
                });
                if (applied) {
                    await deleteDraft(draftRef).catch(error => logger.warn(`Illustration draft cleanup failed`, {gameId, error: error.message}));
                    logger.info(`Illustration draft adopted after creation`, {gameId, costUSD: imagesCostUSD});
                }
                return;
            } catch (error: any) {
                logger.error(`Illustration draft adoption failed`, {gameId, error: error.message});
                break;
            }
        }
        if (draft.status === 'failed') {
            abandonedCostUSD = draft.totalCostUSD ?? 0;
            await deleteDraft(draftRef).catch(() => undefined);
            break;
        }
        if (draft.generatingAt && Date.now() - draft.generatingAt >= STALE_REGEN_MS) break;
    }

    // Fallback: draw for the game itself. Flip the placeholder status so the
    // generator's claim (pending|failed → generating) can take the game; the
    // failed draft's spend was already billed and just moves into this game's
    // totals so the player can see where it went.
    const released = await db.runTransaction(async tx => {
        const gameSnap = await tx.get(gameRef);
        const g = gameSnap.exists ? (gameSnap.data() as Game) : null;
        if (!g || g.ownerEmail !== userEmail || g.avatarsStatus !== 'generating') return false;
        tx.update(gameRef, {
            avatarsStatus: 'failed',
            ...(abandonedCostUSD > 0 ? {
                totalGameCost: firestore.FieldValue.increment(abandonedCostUSD),
                totalImagesCost: firestore.FieldValue.increment(abandonedCostUSD),
            } : {}),
        });
        return true;
    });
    if (released) {
        logger.warn(`Illustration draft not adopted; drawing for the game instead`, {gameId});
        await runAvatarGeneration(gameId, userEmail);
    }
}
