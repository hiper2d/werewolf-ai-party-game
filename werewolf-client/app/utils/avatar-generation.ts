import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {Game, USER_TIERS, UserTier, AVATAR_GM_KEY, SCENE_WELCOME_KEY, SCENE_NIGHT_KEY, AVATAR_VARIANTS_COLLECTION, avatarVariantKey, avatarSheetKey, MANNEQUIN_VARIANT_INDEX, AvatarFraming, AvatarVariantEntry, CARD_HEIGHT_PX, CARD_WIDTH_PX, ImageRect, ReframeTarget} from "@/app/api/game-models";
import {defaultFraming, fitFraming, isFramingShape} from "@/app/utils/avatar-framing";
import {describeDividers, detectSheetGrid} from "@/app/utils/sheet-detection";
import {PRESET_SHEET_SIZE} from "@/app/utils/preset-avatars";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {updateUserMonthlySpending, deductBalance} from "@/app/api/user-actions";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";
import {API_KEY_CONSTANTS, IMAGE_MODEL_CONSTANTS, IMAGE_MODEL_PRICING} from "@/app/ai/ai-models";
import {logger} from "@/app/utils/logger";
import {sanitizeArtStyle} from "@/app/utils/art-style";

// One grid image covers the whole cast; models and pricing live in
// IMAGE_MODEL_CONSTANTS / IMAGE_MODEL_PRICING (ai-models.ts).
const AVATAR_MODEL = IMAGE_MODEL_CONSTANTS.AVATARS;
const IMAGE_OUTPUT_PRICE_PER_M = IMAGE_MODEL_PRICING[AVATAR_MODEL].imageOutputPricePerM;
const TEXT_INPUT_PRICE_PER_M = IMAGE_MODEL_PRICING[AVATAR_MODEL].textInputPricePerM;

// Grid dimensions by cell count (bots + human player + Game Master).
// The model reliably fills row-major grids up to 4x4 in one 2K image.
function gridFor(cells: number): { cols: number; rows: number } {
    if (cells <= 6) return {cols: 3, rows: 2};
    if (cells <= 8) return {cols: 4, rows: 2};
    if (cells <= 9) return {cols: 3, rows: 3};
    if (cells <= 12) return {cols: 4, rows: 3};
    return {cols: 4, rows: 4};
}

interface AvatarCell {
    key: string;      // Firestore doc id + URL segment ([a-zA-Z0-9] names, or the GM key)
    label: string;    // Character name, for logs and prompt guidance — never drawn into the image
    prompt: string;   // One-line visual description for this cell
}

// Stories are narrative, not visual — one sentence is plenty of guidance for the
// painter. Feeding the full three-sentence story per cell is what made the model
// typeset it INTO the image as a bio column next to the face (the Evangelion
// "character card" failure, 2026-08-23).
function firstSentence(text: string): string {
    const m = text.match(/^.{0,180}?[.!?](?=\s|$)/);
    return m ? m[0] : text.slice(0, 180);
}

/** The character facts the painter needs. A Game satisfies this directly; the
 * preview page's draft (no game yet) builds one from its form state. */
export interface AvatarSubject {
    theme: string;
    description: string;
    artStyle?: string;
    humanPlayerName: string;
    bots: {name: string; gender: string; story: string; visualDescription?: string}[];
}

/** What the painter is told a character looks like: the dedicated visual description
 * when the game has one, else the story's first sentence (legacy games — stories are
 * written for role ambiguity, not appearance, so this is the weaker direction). */
export function portraitDirection(bot: {story: string; visualDescription?: string}): string {
    const visual = bot.visualDescription?.trim();
    return visual ? visual : firstSentence(bot.story);
}

/** Every portrait key a set for this subject contains, in grid order. The
 * single source of truth for "which docs does a set write" — the preview draft
 * compares these against the game's cast before adopting a set. */
export function portraitKeysFor(subject: AvatarSubject): string[] {
    return buildCells(subject).map(c => c.key);
}

function buildCells(game: AvatarSubject): AvatarCell[] {
    const cells: AvatarCell[] = game.bots.map(bot => ({
        key: bot.name,
        label: bot.name,
        prompt: `(${bot.gender}) "${bot.name}" — ${portraitDirection(bot)}`,
    }));
    cells.push({
        key: game.humanPlayerName,
        label: game.humanPlayerName,
        prompt: `"${game.humanPlayerName}" — the protagonist of this tale, an expressive determined face fitting the setting`,
    });
    cells.push({
        key: AVATAR_GM_KEY,
        label: 'Game Master',
        // Male on purpose: the GM's TTS voice defaults to male (previewGame
        // falls back to a random male voice), so the portrait must match.
        prompt: `(male) "Game Master" — the omniscient narrator of this story: a male storyteller figure fitting the setting, keeper of every secret at the table, serene, impartial, faintly amused`,
    });
    return cells;
}

export function buildPrompt(game: AvatarSubject, cells: AvatarCell[], cols: number, rows: number): string {
    const cellLines = cells.map(
        (c, i) => `Cell ${i + 1}: ${c.prompt}. Its own distinct flat solid muted background color.`
    ).join("\n");

    // The player's art direction replaces the model's free choice of style; it
    // stays style-only guidance, and the no-text rule below still has the last word.
    const artStyle = sanitizeArtStyle(game.artStyle);
    const styleLine = artStyle
        ? `Render every portrait in this art style, chosen by the player: "${artStyle}". Apply it consistently to every portrait: same rendering technique, same palette family, same lighting.`
        : `Choose ONE cohesive illustration style that fits this setting and apply it consistently to every portrait: same rendering technique, same palette family, same lighting.`;

    return `A character portrait sheet for a social deduction game, drawn as a single image: a precise grid of exactly ${cells.length} rectangular cells, ${cols} columns and ${rows} rows, all cells exactly equal size, separated by thin dark divider lines. Each cell contains one bust portrait (head and shoulders) of a different character, centered in its cell.

Setting — "${game.theme}": ${game.description}

${styleLine} Every face must be distinct and memorable, and match its character description. No character may span more than one cell. Give each cell its own flat solid muted desaturated background color, different from its neighbors. Row-major order, left to right, top to bottom:

${cellLines}

The character descriptions above are guidance for the drawing only — NEVER render them as text. Absolutely no text anywhere in the image: no names, no labels, no captions, no letters, no writing of any kind — and no lettering on clothing, equipment, insignia or logos.`;
}


export interface GeneratedImage {
    buffer: Buffer;
    costUSD: number;
}

/** One image-model call. Cost is per IMAGE, not per pixel (a 1K and a 2K image
 * both bill ~1120 output tokens), so fewer calls — not lower resolution — is
 * what minimizes cost. Optional labeled reference JPEGs (the game's welcome
 * scene, character portraits) anchor mid-game illustrations to the established
 * style, location and faces. */
export async function generateImage(apiKey: string, prompt: string, aspectRatio: string, opts?: {references?: {label: string; jpeg: Buffer}[]; imageSize?: '1K' | '2K'}): Promise<GeneratedImage> {
    const input: any[] = [{type: "text", text: prompt}];
    for (const ref of opts?.references ?? []) {
        input.push({type: "text", text: ref.label});
        input.push({type: "image", mime_type: "image/jpeg", data: ref.jpeg.toString('base64')});
    }
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
        body: JSON.stringify({
            model: AVATAR_MODEL,
            input,
            response_format: {type: "image", mime_type: "image/jpeg", aspect_ratio: aspectRatio, image_size: opts?.imageSize ?? "2K"},
        }),
    });
    if (!res.ok) {
        throw new Error(`Image request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const json = await res.json();
    const b64 = (json.steps || [])
        .flatMap((s: any) => s.content || [])
        .find((c: any) => c.type === "image" && c.data)?.data;
    if (!b64) throw new Error('Image response contained no image data');

    const usage = json.usage || {};
    const imageTokens = (usage.output_tokens_by_modality || [])
        .filter((m: any) => m.modality === 'image')
        .reduce((sum: number, m: any) => sum + (m.tokens || 0), 0);
    const inputTokens = usage.total_input_tokens || 0;
    const costUSD = parseFloat((
        imageTokens / 1_000_000 * IMAGE_OUTPUT_PRICE_PER_M +
        inputTokens / 1_000_000 * TEXT_INPUT_PRICE_PER_M
    ).toFixed(6));

    return {buffer: Buffer.from(b64, 'base64'), costUSD};
}

// Both chat scene images ride in ONE image (stacked panels, sliced in half):
// top = the welcome establishing shot, bottom = the same place at night.
function buildScenePrompt(game: AvatarSubject): string {
    const artStyle = sanitizeArtStyle(game.artStyle);
    const styleClause = artStyle
        ? `in this art style, chosen by the player: "${artStyle}"`
        : `in one cohesive illustration style that fits this setting`;
    return `A single image divided into exactly 2 equal horizontal panels, one above the other, separated by a thin dark divider line. Both panels depict the same place, ${styleClause} — atmospheric establishing shots, no people in close-up, cinematic composition.

Setting — "${game.theme}": ${game.description}

Top panel: the setting at the story's opening — the gathering place of the characters, inviting yet with a first hint of unease.
Bottom panel: the same setting at night — dark, ominous, something predatory hidden in the shadows.

No text anywhere in the image.`;
}

interface AvatarSlice {
    key: string;
    label: string;
    jpeg: Buffer;
    framing: AvatarFraming;
}

/** The kept sheet: the grid image itself (re-encoded), its size and the
 * cells the cards were cut from. Stored as avatars/sheet-{round}. */
export interface DrawnSheet {
    jpeg: Buffer;
    width: number;
    height: number;
    cells: ImageRect[];
    detected: boolean;
}

// The model returns ~2.4 MB loosely-compressed JPEGs; at this width and
// quality a sheet is ~400 KB (~530 KB as base64), comfortably under the
// 1 MiB Firestore doc limit, with cells still ~500 px tall.
const SHEET_MAX_WIDTH = 2400;
const SHEET_JPEG_QUALITY = 85;
const SHEET_MAX_BASE64_BYTES = 900_000;

/**
 * Cuts the cards out of a drawn sheet and keeps the sheet. Cells come from
 * the divider lines (sheet-detection.ts); each card is the largest 3:4
 * rectangle in its cell, top-anchored, with the default circle — the framing
 * the owner can later move.
 */
async function sliceGrid(sharp: any, raw: Buffer, cells: AvatarCell[], count: number, cols: number, rows: number, logContext: Record<string, unknown>): Promise<{slices: AvatarSlice[]; sheet: DrawnSheet}> {
    // Normalise the working resolution first so cells, cards and the stored
    // sheet all share one pixel space.
    const grid: Buffer = await sharp(raw).resize({width: SHEET_MAX_WIDTH, withoutEnlargement: true}).toBuffer();
    const {data, info} = await sharp(grid).greyscale().raw().toBuffer({resolveWithObject: true});
    const width: number = info.width, height: number = info.height;
    if (width < 100 * cols || height < 100 * rows) throw new Error(`Avatar grid has unusable dimensions ${width}x${height}`);

    const plane = {width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.length)};
    const gridCells = detectSheetGrid(plane, cols, rows);
    if (!gridCells.detected) {
        // The known failure: fewer rows drawn than asked. The equal split is
        // wrong for those, but the sheet is kept, so the owner can reframe.
        logger.warn(`AVATAR_GRID_MISMATCH: sheet dividers don't match the ${cols}x${rows} request; using equal split`, {
            ...logContext, width, height, dividers: describeDividers(plane),
        });
    }

    const slices: AvatarSlice[] = [];
    for (let i = 0; i < count; i++) {
        const framing = defaultFraming(gridCells.cells[i]);
        const jpeg = await sharp(grid)
            .extract(framing.card)
            .resize(CARD_WIDTH_PX, CARD_HEIGHT_PX)
            .jpeg({quality: 85})
            .toBuffer();
        slices.push({key: cells[i].key, label: cells[i].label, jpeg, framing});
    }

    let sheetJpeg: Buffer = await sharp(grid).jpeg({quality: SHEET_JPEG_QUALITY, mozjpeg: true}).toBuffer();
    if (sheetJpeg.length * 4 / 3 > SHEET_MAX_BASE64_BYTES) {
        sheetJpeg = await sharp(grid).jpeg({quality: 72, mozjpeg: true}).toBuffer();
    }
    return {
        slices,
        sheet: {jpeg: sheetJpeg, width, height, cells: gridCells.cells.slice(0, count), detected: gridCells.detected},
    };
}

/** Cuts one card out of a stored sheet at the given framing. */
export async function cutCard(sharp: any, sheet: Buffer, card: ImageRect): Promise<Buffer> {
    return sharp(sheet)
        .extract(card)
        .resize(CARD_WIDTH_PX, CARD_HEIGHT_PX)
        .jpeg({quality: 85})
        .toBuffer();
}

/** A drawn portrait crop. Every round's crops are kept as candidates: the
 * player flips between them on the character card and decides what looks
 * right — there is no automated judge anymore (the slice verifier was removed
 * 2026-08-30: it added a vision call plus up to two full redraws of waiting
 * time, and the reroll button already puts quality in the player's hands). */
export interface AvatarCandidate {
    key: string;
    jpeg: Buffer;
    // Where on its sheet the card was cut; absent only for legacy candidates
    // adopted from pre-sheet games.
    framing?: AvatarFraming;
}

// One avatar doc is ~60-90KB of base64, and a full cast over three rounds is
// ~40 of them — far under the 500-write batch limit but well over Firestore's
// request size limit, so commits go out in small chunks.
const AVATAR_DOC_BATCH = 8;

// How long a reroll marker is trusted before another attempt may claim the game.
export const STALE_REGEN_MS = 5 * 60 * 1000;

export interface PendingWrite {
    ref: firestore.DocumentReference;
    data: Record<string, any>;
}

export async function commitChunked(writes: PendingWrite[]): Promise<void> {
    for (let i = 0; i < writes.length; i += AVATAR_DOC_BATCH) {
        const batch = db!.batch();
        for (const w of writes.slice(i, i + AVATAR_DOC_BATCH)) batch.set(w.ref, w.data);
        await batch.commit();
    }
}

export type AvatarVariantMap = Record<string, AvatarVariantEntry>;

// How many generated candidates a character keeps. Indices are monotonic
// (candidate ids never change, so cached ?n= URLs stay valid); past the cap
// the oldest docs are deleted and `first` advances. The mannequin preset is
// on top of these — it's a static asset, not a stored candidate.
export const MAX_AVATAR_CANDIDATES = 3;

/** Pure bookkeeping for appending `added` fresh candidates to a character's
 * list: the new window, the newest candidate as the selection, and which
 * aged-out doc indices to delete. */
export function appendWindow(existing: {n: number; first?: number} | undefined, added: number): {n: number; sel: number; first: number; drop: {from: number; to: number}} {
    const offset = existing?.n ?? 0;
    const oldFirst = existing?.first ?? 0;
    const n = offset + added;
    const first = Math.max(oldFirst, n - MAX_AVATAR_CANDIDATES);
    return {n, sel: offset, first, drop: {from: oldFirst, to: first}};
}

/** Stores every candidate in the avatarVariants subcollection and copies the
 * selected one into avatars/{key}, where all the existing readers look (the
 * image route, illustration reference portraits, the chat and cinematic UIs) —
 * that copy is why variants needed no changes anywhere downstream.
 * `existing` carries the counts already stored, so a reroll appends. Works on
 * any parent doc with those two subcollections — a game or a preview draft;
 * `docExtras` is merged into every image doc (the draft's TTL field). */
export async function writeCandidates(
    gameRef: firestore.DocumentReference,
    candidates: AvatarCandidate[],
    existing: AvatarVariantMap,
    extraWrites: PendingWrite[] = [],
    docExtras: Record<string, any> = {},
    sheet?: DrawnSheet,
): Promise<{variants: AvatarVariantMap; versions: Record<string, number>}> {
    const byKey = new Map<string, AvatarCandidate[]>();
    for (const candidate of candidates) {
        const list = byKey.get(candidate.key) ?? [];
        list.push(candidate);
        byKey.set(candidate.key, list);
    }

    const now = Date.now();
    const writes: PendingWrite[] = [...extraWrites];
    const deletes: firestore.DocumentReference[] = [];
    const variants: AvatarVariantMap = {...existing};
    const versions: Record<string, number> = {};
    // Candidate index == draw round, so every key of this draw lands on the
    // same index and the sheet is stored once under it (see game-models).
    let round: number | null = null;

    for (const [key, list] of byKey) {
        const window = appendWindow(existing[key], list.length);
        round = round === null ? window.sel : Math.max(round, window.sel);
        const framing: Record<string, AvatarFraming> = {...(existing[key]?.framing ?? {})};
        const drawn: Record<string, AvatarFraming> = {...(existing[key]?.drawn ?? {})};
        list.forEach((candidate, i) => {
            const index = window.sel + i;
            if (candidate.framing) {
                framing[String(index)] = candidate.framing;
                drawn[String(index)] = candidate.framing;
            }
            writes.push({
                ref: gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, index)),
                data: {
                    data: candidate.jpeg.toString('base64'),
                    mime: 'image/jpeg',
                    createdAt: now,
                    ...(candidate.framing ? {sheet: index, card: candidate.framing.card, circle: candidate.framing.circle} : {}),
                    ...docExtras,
                },
            });
        });
        for (let i = window.drop.from; i < window.drop.to; i++) {
            deletes.push(gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, i)));
            delete framing[String(i)];
            delete drawn[String(i)];
        }
        // The freshly drawn face is what's shown; the kept earlier candidates
        // (and the mannequin) stay one arrow-click away on the character card.
        variants[key] = {
            n: window.n,
            sel: window.sel,
            ...(window.first > 0 ? {first: window.first} : {}),
            ...(Object.keys(framing).length > 0 ? {framing, drawn} : {}),
            ...(existing[key]?.mannequin ? {mannequin: existing[key].mannequin} : {}),
        };
        versions[key] = now;
        writes.push({
            ref: gameRef.collection('avatars').doc(key),
            data: {data: list[0].jpeg.toString('base64'), mime: 'image/jpeg', createdAt: now, ...docExtras},
        });
    }

    if (sheet && round !== null) {
        writes.push({
            ref: gameRef.collection('avatars').doc(avatarSheetKey(round)),
            data: {
                data: sheet.jpeg.toString('base64'),
                mime: 'image/jpeg',
                width: sheet.width,
                height: sheet.height,
                cells: sheet.cells,
                detected: sheet.detected,
                createdAt: now,
                ...docExtras,
            },
        });
    }
    // A sheet outlives its cards only while some character still keeps a
    // candidate from that round.
    const minFirst = Math.min(...Object.values(variants).map(v => v.first ?? 0));
    const oldMinFirst = Math.min(...Object.values(existing).map(v => v.first ?? 0), minFirst);
    for (let i = oldMinFirst; i < minFirst; i++) {
        deletes.push(gameRef.collection('avatars').doc(avatarSheetKey(i)));
    }

    await commitChunked(writes);
    await Promise.all(deletes.map(ref => ref.delete()));
    return {variants, versions};
}

/** Paid tier pays cost + markup off the prepaid balance; free tier only records
 * the spend. Same shape as every other image call in the app. */
export async function billImages(userEmail: string, tier: UserTier, costUSD: number): Promise<void> {
    if (costUSD <= 0) return;
    if (tier === USER_TIERS.PAID) {
        const chargedAmount = parseFloat((costUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
        await deductBalance(userEmail, chargedAmount);
        await updateUserMonthlySpending(userEmail, chargedAmount, tier);
    } else {
        await updateUserMonthlySpending(userEmail, costUSD, tier);
    }
}

/**
 * Core of themed avatar generation — see generateGameAvatars (avatar-actions.ts)
 * for the flow description. Split out from the server action so scripts (tests,
 * backfills) can run it with an explicit owner email.
 *
 * Returns a PLAIN object (raw Firestore doc data contains Timestamp class
 * instances that server actions can't serialize to client components), or null
 * when the game doesn't exist.
 */
export interface AvatarGenerationResult {
    avatarsStatus: Game['avatarsStatus'];
    avatarsVersion?: number;
    avatarVariants?: AvatarVariantMap;
    avatarVersions?: Record<string, number>;
    avatarRegenCount?: number;
}

function resultFrom(game: Game): AvatarGenerationResult {
    return {
        avatarsStatus: game.avatarsStatus,
        avatarsVersion: game.avatarsVersion,
        avatarVariants: game.avatarVariants ?? {},
        avatarVersions: game.avatarVersions ?? {},
        avatarRegenCount: game.avatarRegenCount ?? 0,
    };
}

/** Cells plus the throwaway fillers that keep the grid full. The model reliably
 * fills FULL grids but sometimes ignores "leave the last cells empty", which
 * shifts every row and corrupts the slicing. */
export function buildPaddedCells(game: AvatarSubject): {cells: AvatarCell[]; cols: number; rows: number; realCount: number} {
    const cells = buildCells(game);
    const {cols, rows} = gridFor(cells.length);
    const realCount = cells.length;
    for (let i = cells.length; i < cols * rows; i++) {
        cells.push({
            key: `__filler${i}`,
            label: 'Stranger',
            prompt: `"Stranger" — an anonymous hooded figure fitting the setting, face hidden in shadow`,
        });
    }
    return {cells, cols, rows, realCount};
}

/** Running total of what a draw has paid Google for so far. Kept OUTSIDE the
 * drawing function so a run that dies partway still reports the images it did
 * get: that spend used to vanish entirely (the billing block sat after the
 * throw) — roughly $0.60 of invisible spend in one 7-day sample. */
export interface SpendLedger {
    spentUSD: number;
}

/** A drawn illustration set, not yet stored anywhere. */
export interface DrawnSet {
    portraits: AvatarCandidate[];
    // The sheet the portraits were cut from — stored beside them so the
    // owner can move any card's frame later.
    sheet: DrawnSheet;
    // welcome + night, or empty when scenes weren't requested or failed
    // (scene failure never blocks portraits).
    scenes: {key: string; jpeg: Buffer}[];
}

/**
 * Draws a set for a subject: the portrait grid (one draw, sliced into crops)
 * and, when asked, the scene pair in parallel. Pure drawing — no Firestore, no
 * billing — so the game generator, the in-game reroll and the preview draft
 * all run the same pipeline and differ only in where the result lands.
 * `onStage` fires as each half lands, for progress display.
 */
export async function drawIllustrationSet(
    apiKey: string,
    subject: AvatarSubject,
    opts: {
        withScenes: boolean;
        ledger: SpendLedger;
        logContext: Record<string, unknown>;
        onStage?: (stage: 'portraits' | 'scene') => Promise<void>;
    },
): Promise<DrawnSet> {
    const {ledger, logContext} = opts;
    const {cells, cols, rows, realCount} = buildPaddedCells(subject);

    // sharp is a native module; dynamic import keeps it out of the
    // client/server bundle graph.
    const sharp = (await import('sharp')).default;

    // Scene pair: stacked panels sliced in half → welcome (top), night
    // (bottom). Downscale to 1024 wide — plenty for a chat bubble.
    const scenePromise: Promise<{key: string; jpeg: Buffer}[]> = !opts.withScenes
        ? Promise.resolve([])
        : generateImage(apiKey, buildScenePrompt(subject), "3:4")
            .then(async image => {
                ledger.spentUSD += image.costUSD;
                const scenes = image.buffer;
                const sceneMeta = await sharp(scenes).metadata();
                const w = sceneMeta.width || 0;
                const halfH = Math.floor((sceneMeta.height || 0) / 2);
                const divider = 6; // skip the divider line between panels
                const out: {key: string; jpeg: Buffer}[] = [];
                for (const [key, top] of [[SCENE_WELCOME_KEY, 0], [SCENE_NIGHT_KEY, halfH + divider]] as [string, number][]) {
                    const jpeg = await sharp(scenes)
                        .extract({left: 0, top, width: w, height: halfH - divider})
                        .resize({width: 1024})
                        .jpeg({quality: 80})
                        .toBuffer();
                    out.push({key, jpeg});
                }
                await opts.onStage?.('scene');
                return out;
            })
            .catch(error => {
                logger.warn(`Scene image generation failed`, {...logContext, error: error?.message});
                return [];
            });

    const grid = await generateImage(apiKey, buildPrompt(subject, cells, cols, rows), "4:3");
    ledger.spentUSD += grid.costUSD;
    const {slices, sheet} = await sliceGrid(sharp, grid.buffer, cells, realCount, cols, rows, opts.logContext);
    await opts.onStage?.('portraits');

    return {
        portraits: slices.map(sl => ({key: sl.key, jpeg: sl.jpeg, framing: sl.framing})),
        sheet,
        scenes: await scenePromise,
    };
}

/** Scene images as writes into a parent's `avatars` subcollection. */
export function sceneWritesFor(parentRef: firestore.DocumentReference, scenes: DrawnSet['scenes'], docExtras: Record<string, any> = {}): PendingWrite[] {
    return scenes.map(({key, jpeg}) => ({
        ref: parentRef.collection('avatars').doc(key),
        data: {data: jpeg.toString('base64'), mime: 'image/jpeg', createdAt: Date.now(), ...docExtras},
    }));
}

export async function runAvatarGeneration(gameId: string, userEmail: string): Promise<AvatarGenerationResult | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);

    // Claim the work or bail (idempotency + owner check).
    const claimed = await db.runTransaction(async tx => {
        const snap = await tx.get(gameRef);
        if (!snap.exists) return null;
        const g = snap.data() as Game;
        if (g.avatarsStatus !== 'pending' && g.avatarsStatus !== 'failed') return null;
        if (g.ownerEmail !== userEmail) return null;
        tx.update(gameRef, {avatarsStatus: 'generating'});
        return {...g, id: snap.id} as Game;
    });
    if (!claimed) {
        const snap = await gameRef.get();
        return snap.exists ? resultFrom(snap.data() as Game) : null;
    }

    const ledger: SpendLedger = {spentUSD: 0};
    let tier: UserTier = USER_TIERS.FREE;

    try {
        const keys = await getUserTierAndApiKeys(userEmail);
        tier = keys.tier;
        const apiKey = keys.apiKeys[API_KEY_CONSTANTS.GOOGLE];
        if (!apiKey) throw new Error('No Google API key available for avatar generation');

        const drawn = await drawIllustrationSet(apiKey, claimed, {withScenes: true, ledger, logContext: {gameId}});
        const {variants, versions} = await writeCandidates(gameRef, drawn.portraits, {}, sceneWritesFor(gameRef, drawn.scenes), {}, drawn.sheet);

        const costUSD = parseFloat(ledger.spentUSD.toFixed(6));
        await gameRef.update({
            avatarsStatus: 'ready',
            avatarsVersion: Date.now(),
            avatarVariants: variants,
            avatarVersions: versions,
            totalGameCost: firestore.FieldValue.increment(costUSD),
            // Image spending is tracked separately from LLM calls so its real
            // cost stays visible (totalImagesCost is a subset of totalGameCost).
            totalImagesCost: firestore.FieldValue.increment(costUSD),
        });
        ledger.spentUSD = 0; // accounted for; the catch must not double-count it

        await billImages(userEmail, tier, costUSD);

        logger.info(`Avatars generated for game ${gameId}`, {gameId, portraits: Object.keys(variants).length, scenes: drawn.scenes.length, costUSD});
    } catch (error: any) {
        // Avatars are decorative: never surface errorState, just mark failed so
        // the UI keeps its preset-sketch fallback and a later visit may retry.
        logger.error(`Avatar generation failed for game ${gameId}`, {gameId, error: error.message, costUSD: ledger.spentUSD});
        await gameRef.update({avatarsStatus: 'failed'});
        await recordAbandonedSpend(gameRef, userEmail, tier, ledger.spentUSD, gameId);
    }

    const snap = await gameRef.get();
    return snap.exists ? resultFrom(snap.data() as Game) : null;
}

/** Images a failed run already paid Google for. Recorded (and billed) rather
 * than silently eaten — the player keeps no portraits, but the spend is real
 * and has to show up in the game's cost total. `costFields` names the running
 * totals on the parent doc (a game's two cost fields, a draft's one). */
export async function recordAbandonedSpend(
    parentRef: firestore.DocumentReference,
    userEmail: string,
    tier: UserTier,
    spentUSD: number,
    logId: string,
    costFields: string[] = ['totalGameCost', 'totalImagesCost'],
): Promise<void> {
    if (spentUSD <= 0) return;
    const costUSD = parseFloat(spentUSD.toFixed(6));
    try {
        await parentRef.update(Object.fromEntries(costFields.map(f => [f, firestore.FieldValue.increment(costUSD)])));
        await billImages(userEmail, tier, costUSD);
    } catch (billingError: any) {
        logger.error(`Failed to record abandoned image spend for ${logId}`, {id: logId, error: billingError.message, costUSD});
    }
}

/**
 * Owner-triggered portrait reroll. Draws ONE new grid; its crops are appended
 * to each character's candidate list and become the shown portraits; the
 * previous ones stay reachable through the arrows on the character card.
 *
 * The scene images are not redrawn: they cost as much again as the portraits,
 * and a player asking for new faces did not ask for a new tavern.
 *
 * `maxRegens` is enforced inside the claim transaction so two tabs can't spend
 * a free game's single reroll twice. Returns null when the reroll can't start
 * (not the owner, not ready, already running, or out of rerolls).
 */
export async function runAvatarRegeneration(gameId: string, userEmail: string, maxRegens: number): Promise<AvatarGenerationResult | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);

    const claimed = await db.runTransaction(async tx => {
        const snap = await tx.get(gameRef);
        if (!snap.exists) return null;
        const g = snap.data() as Game;
        if (g.ownerEmail !== userEmail) return null;
        if (g.avatarsStatus !== 'ready') return null;
        // A reroll that died mid-flight (function timeout) leaves the marker
        // behind; after the stale window the game is claimable again rather
        // than locked out of rerolls forever.
        if (g.avatarsRegeneratingAt && Date.now() - g.avatarsRegeneratingAt < STALE_REGEN_MS) return null;
        if ((g.avatarRegenCount ?? 0) >= maxRegens) return null;
        // Deliberately not avatarsStatus: 'generating' — that would send the
        // whole cast back to preset sketches for the ~20s of the reroll
        // (getAvatarUrl gates on status). The current portraits stay up.
        tx.update(gameRef, {avatarsRegeneratingAt: Date.now()});
        return {...g, id: snap.id} as Game;
    });
    if (!claimed) return null;

    const ledger: SpendLedger = {spentUSD: 0};
    let tier: UserTier = USER_TIERS.FREE;

    try {
        const keys = await getUserTierAndApiKeys(userEmail);
        tier = keys.tier;
        const apiKey = keys.apiKeys[API_KEY_CONSTANTS.GOOGLE];
        if (!apiKey) throw new Error('No Google API key available for avatar regeneration');

        // Games generated before variants existed have portraits but no
        // candidate list; adopt what they have as candidate 0 so the reroll
        // appends instead of orphaning it.
        const existing = Object.keys(claimed.avatarVariants ?? {}).length > 0
            ? claimed.avatarVariants!
            : await adoptExistingAvatars(gameRef, portraitKeysFor(claimed));

        const drawn = await drawIllustrationSet(apiKey, claimed, {withScenes: false, ledger, logContext: {gameId, reroll: true}});
        const {variants, versions} = await writeCandidates(gameRef, drawn.portraits, existing, [], {}, drawn.sheet);

        const costUSD = parseFloat(ledger.spentUSD.toFixed(6));
        await gameRef.update({
            avatarsRegeneratingAt: null,
            avatarsVersion: Date.now(),
            avatarVariants: variants,
            avatarVersions: versions,
            avatarRegenCount: firestore.FieldValue.increment(1),
            totalGameCost: firestore.FieldValue.increment(costUSD),
            totalImagesCost: firestore.FieldValue.increment(costUSD),
        });
        ledger.spentUSD = 0;

        await billImages(userEmail, tier, costUSD);
        logger.info(`Avatars regenerated for game ${gameId}`, {gameId, costUSD});
    } catch (error: any) {
        // A failed reroll leaves the existing portraits exactly as they were.
        logger.error(`Avatar regeneration failed for game ${gameId}`, {gameId, error: error.message, costUSD: ledger.spentUSD});
        await gameRef.update({avatarsRegeneratingAt: null});
        await recordAbandonedSpend(gameRef, userEmail, tier, ledger.spentUSD, gameId);
    }

    const snap = await gameRef.get();
    return snap.exists ? resultFrom(snap.data() as Game) : null;
}

/** Copies a pre-variants game's portraits into the candidate subcollection as
 * candidate 0, so a reroll adds a second option instead of replacing the only one. */
async function adoptExistingAvatars(gameRef: firestore.DocumentReference, keys: string[]): Promise<AvatarVariantMap> {
    const snaps = await Promise.all(keys.map(key => gameRef.collection('avatars').doc(key).get()));
    const writes: PendingWrite[] = [];
    const variants: AvatarVariantMap = {};
    snaps.forEach((snap, i) => {
        const data = snap.exists ? (snap.data() as any) : null;
        if (!data?.data) return;
        writes.push({
            ref: gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(keys[i], 0)),
            data: {data: data.data, mime: data.mime || 'image/jpeg', createdAt: data.createdAt || Date.now()},
        });
        variants[keys[i]] = {n: 1, sel: 0};
    });
    await commitChunked(writes);
    return variants;
}

/**
 * Switches which candidate a character shows: copies that candidate's bytes
 * into avatars/{key} (the doc every reader already looks at) and bumps only
 * this key's cache-buster. MANNEQUIN_VARIANT_INDEX selects the preset sketch
 * instead — nothing is copied (the mannequin is a static asset the client
 * resolves itself); avatars/{key} keeps the last generated face for readers
 * that need real pixels, like illustration references. Returns the new per-key
 * version, or null when the caller isn't the owner or the index doesn't exist.
 */
export async function selectAvatarVariantFor(
    gameId: string,
    userEmail: string,
    key: string,
    index: number,
): Promise<{key: string; sel: number; version: number} | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);
    const snap = await gameRef.get();
    if (!snap.exists) return null;
    const game = snap.data() as Game;
    if (game.ownerEmail !== userEmail) return null;

    const entry = game.avatarVariants?.[key];
    if (!entry) return null;
    const inWindow = index >= (entry.first ?? 0) && index < entry.n;
    if (index !== MANNEQUIN_VARIANT_INDEX && !inWindow) return null;
    if (entry.sel === index) return {key, sel: index, version: game.avatarVersions?.[key] ?? game.avatarsVersion ?? 0};

    if (index === MANNEQUIN_VARIANT_INDEX) {
        const version = Date.now();
        await gameRef.update(
            new firestore.FieldPath('avatarVariants', key, 'sel'), MANNEQUIN_VARIANT_INDEX,
            new firestore.FieldPath('avatarVersions', key), version,
        );
        return {key, sel: MANNEQUIN_VARIANT_INDEX, version};
    }

    const variantSnap = await gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, index)).get();
    const variant = variantSnap.exists ? (variantSnap.data() as any) : null;
    if (!variant?.data) return null;

    const version = Date.now();
    await gameRef.collection('avatars').doc(key).set({
        data: variant.data,
        mime: variant.mime || 'image/jpeg',
        createdAt: version,
    });
    // FieldPath, not a dotted string: the Game Master's key contains a dash,
    // which a string field path would reject.
    await gameRef.update(
        new firestore.FieldPath('avatarVariants', key, 'sel'), index,
        new firestore.FieldPath('avatarVersions', key), version,
    );
    return {key, sel: index, version};
}

// ---------------------------------------------------------------------------
// Reframing (portrait sheets) — implementation follows below.
// ---------------------------------------------------------------------------

export interface ReframeResult {
    key: string;
    target: ReframeTarget;
    // The key's new cache-buster (avatarVersions[key]).
    version: number;
    // The framing as stored (snapped into the sheet's bounds).
    framing: AvatarFraming;
}

export async function reframeGameAvatar(gameId: string, userEmail: string, key: string, target: ReframeTarget, framing: AvatarFraming): Promise<ReframeResult | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const gameRef = db.collection('games').doc(gameId);
    const snap = await gameRef.get();
    if (!snap.exists) return null;
    const game = snap.data() as Game;
    if (game.ownerEmail !== userEmail) return null;
    return applyReframe(gameRef, game.avatarVariants ?? {}, key, target, framing, {});
}

/**
 * The reframe itself, shared by games and drafts. A candidate target loads
 * the round's sheet, snaps the framing into it, re-cuts the card (the doc
 * every reader serves, plus the avatars/{key} copy when that candidate is
 * the selected one) and records the framing on the parent; the mannequin
 * target only records its framing on the preset sheet — the renderers cut
 * the static asset client-side. Returns null when there is nothing to
 * reframe: unknown key, index outside the kept window, no sheet stored for
 * that round (legacy candidates).
 */
export async function applyReframe(
    parentRef: firestore.DocumentReference,
    variants: AvatarVariantMap,
    key: string,
    target: ReframeTarget,
    requested: AvatarFraming,
    docExtras: Record<string, any>,
): Promise<ReframeResult | null> {
    if (!isFramingShape(requested)) throw new Error('Invalid framing');
    const entry = variants[key];
    if (!entry) return null;
    const version = Date.now();

    if (target === 'mannequin') {
        const framing = fitFraming(requested, PRESET_SHEET_SIZE);
        await parentRef.update(
            new firestore.FieldPath('avatarVariants', key, 'mannequin'), framing,
            new firestore.FieldPath('avatarVersions', key), version,
        );
        return {key, target, version, framing};
    }

    const index = target;
    if (!Number.isInteger(index) || index < (entry.first ?? 0) || index >= entry.n) return null;
    const sheetSnap = await parentRef.collection('avatars').doc(avatarSheetKey(index)).get();
    const sheetDoc = sheetSnap.exists ? (sheetSnap.data() as any) : null;
    if (!sheetDoc?.data || !sheetDoc.width || !sheetDoc.height) return null;

    const framing = fitFraming(requested, {width: sheetDoc.width, height: sheetDoc.height});
    const sharp = (await import('sharp')).default;
    const jpeg = await cutCard(sharp, Buffer.from(sheetDoc.data, 'base64'), framing.card);
    const image = {data: jpeg.toString('base64'), mime: 'image/jpeg', createdAt: version, ...docExtras};

    const writes: PendingWrite[] = [{
        ref: parentRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, index)),
        data: {...image, sheet: index, card: framing.card, circle: framing.circle},
    }];
    if (entry.sel === index) {
        writes.push({ref: parentRef.collection('avatars').doc(key), data: image});
    }
    await commitChunked(writes);
    await parentRef.update(
        new firestore.FieldPath('avatarVariants', key, 'framing', String(index)), framing,
        new firestore.FieldPath('avatarVersions', key), version,
    );
    return {key, target, version, framing};
}
