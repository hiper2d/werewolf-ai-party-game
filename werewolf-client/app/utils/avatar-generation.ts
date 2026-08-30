import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {Game, USER_TIERS, UserTier, AVATAR_GM_KEY, SCENE_WELCOME_KEY, SCENE_NIGHT_KEY, AVATAR_VARIANTS_COLLECTION, avatarVariantKey} from "@/app/api/game-models";
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
    // What the slice verifier expects to see in this slot; undefined = don't
    // check (the human player has no gender on record, fillers aren't stored).
    expectedGender?: 'male' | 'female';
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
    bots: {name: string; gender: string; story: string}[];
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
        prompt: `(${bot.gender}) "${bot.name}" — ${firstSentence(bot.story)}`,
        expectedGender: bot.gender === 'male' || bot.gender === 'female' ? bot.gender : undefined,
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
        expectedGender: 'male',
    });
    return cells;
}

function buildPrompt(game: AvatarSubject, cells: AvatarCell[], cols: number, rows: number): string {
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

// Cheap vision model that inspects every sliced avatar: no rendered text, and
// the apparent gender matches the expected character in that slot. The gender
// sequence doubles as the misalignment detector — a drifted grid puts the
// wrong face in a slot (this replaced nameplate transcription 2026-08-23 when
// nameplates were dropped so portraits carry no text at all).
const VERIFY_MODEL = IMAGE_MODEL_CONSTANTS.VERIFIER;

interface AvatarSlice {
    key: string;
    label: string;
    expectedGender?: 'male' | 'female';
    jpeg: Buffer;
}

async function sliceGrid(sharp: any, grid: Buffer, cells: AvatarCell[], count: number, cols: number): Promise<AvatarSlice[]> {
    const meta = await sharp(grid).metadata();
    const rows = Math.ceil(cells.length / cols);
    const cellW = Math.floor((meta.width || 0) / cols);
    const cellH = Math.floor((meta.height || 0) / rows);
    if (cellW < 100 || cellH < 100) throw new Error(`Avatar grid has unusable dimensions ${meta.width}x${meta.height}`);
    const inset = 8; // skip the divider lines

    const slices: AvatarSlice[] = [];
    for (let i = 0; i < count; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const jpeg = await sharp(grid)
            .extract({
                left: col * cellW + inset,
                top: row * cellH + inset,
                width: cellW - 2 * inset,
                height: cellH - 2 * inset,
            })
            .resize(512, 512, {fit: 'cover', position: 'top'})
            .jpeg({quality: 85})
            .toBuffer();
        slices.push({key: cells[i].key, label: cells[i].label, expectedGender: cells[i].expectedGender, jpeg});
    }
    return slices;
}

/** Verdict for one crop. `hasText` = the model typeset something into the cell;
 * `genderMismatch` = the face doesn't match the character expected in that
 * slot, which is also how a drifted grid shows up (every slot holds a
 * neighbour's face). */
export interface SliceVerdict {
    hasText: boolean;
    genderMismatch: boolean;
    problem?: string;
}

/** Inspects every sliced avatar in ONE call — all crops in a single request,
 * one verdict line each — and returns those verdicts unreduced.
 *
 * It used to collapse them into a single ok/not-ok for the whole grid, which is
 * what let one lettered badge throw away twelve good portraits: 78% of the
 * re-rolls in a 7-day sample discarded a majority-good set, and a third of all
 * runs hard-failed to preset sketches (docs/avatar-slice-verification-failures.md).
 * Deciding what to keep is the caller's job now.
 *
 * Throws when the reply is unparseable — a misbehaving verifier, not a bad grid. */
async function verifySlices(apiKey: string, slices: AvatarSlice[]): Promise<SliceVerdict[]> {
    const parts: any[] = [{
        text: `Each image below is a single character portrait. For each image answer two things: TEXT = YES only if clearly readable letters, words or numbers are written in the image (captions, labels, signs, writing on clothing), otherwise NO — decorative shapes, hair clips, jewelry, emblems or patterns without readable letters are NOT text. GENDER = MALE, FEMALE or OTHER for the portrait's subject (OTHER for robots, creatures, masked or ambiguous figures). Reply with exactly ${slices.length} lines, formatted "<number>: TEXT=<YES|NO> GENDER=<MALE|FEMALE|OTHER>". No other text.`,
    }];
    slices.forEach((sl, i) => {
        parts.push({text: `Image ${i + 1}:`});
        parts.push({inline_data: {mime_type: 'image/jpeg', data: sl.jpeg.toString('base64')}});
    });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VERIFY_MODEL}:generateContent`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
        body: JSON.stringify({contents: [{parts}]}),
    });
    if (!res.ok) throw new Error(`Slice verification failed: HTTP ${res.status}`);
    const json = await res.json();
    const text: string = (json.candidates?.[0]?.content?.parts || []).map((pt: any) => pt.text || '').join('\n');

    const byIndex = new Map<number, {hasText: boolean; gender: string}>();
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*(\d+)\s*[:.\-]?\s*TEXT\s*=\s*(YES|NO)\s+GENDER\s*=\s*(MALE|FEMALE|OTHER)/i);
        if (m) byIndex.set(parseInt(m[1], 10), {hasText: m[2].toUpperCase() === 'YES', gender: m[3].toLowerCase()});
    }
    if (byIndex.size === 0) throw new Error('Slice verification reply was unparseable');

    return slices.map((sl, i) => {
        const verdict = byIndex.get(i + 1);
        // A missing line is a hole in the reply, not evidence about the crop —
        // flag it so a clean alternate wins the selection, and say why.
        if (!verdict) return {hasText: false, genderMismatch: true, problem: `${sl.label}: no verdict`};
        if (verdict.hasText) return {hasText: true, genderMismatch: false, problem: `${sl.label}: rendered text`};
        // OTHER never counts: stylized, masked and non-human faces read
        // ambiguously and would flag half a themed cast.
        if (sl.expectedGender && verdict.gender !== 'other' && verdict.gender !== sl.expectedGender) {
            return {hasText: false, genderMismatch: true, problem: `${sl.label}: expected ${sl.expectedGender}, saw ${verdict.gender}`};
        }
        return {hasText: false, genderMismatch: false};
    });
}

/** A drawn portrait plus what the verifier thought of it. Every round's crops
 * are kept: the ones a stricter pipeline would have thrown away are exactly the
 * alternates a player wants to flip between on the character card. */
export interface AvatarCandidate {
    key: string;
    jpeg: Buffer;
    flagged: boolean;
    problem?: string;
}

/** Which candidate to show by default: the first the verifier had no complaint
 * about, else the first drawn. A flagged portrait still beats no portrait — the
 * owner can flip to another one, and a themed face with a stray letter on its
 * collar reads better than a preset pencil sketch. */
export function chooseSelected(candidates: {flagged: boolean}[]): number {
    const clean = candidates.findIndex(c => !c.flagged);
    return clean >= 0 ? clean : 0;
}

/** Whether a round failed as a whole image rather than in a few cells — the one
 * case where another draw is the right answer.
 *
 * A majority of cells carrying text means the model drew a labeled
 * character-card layout instead of portraits; more than one gender mismatch
 * means the grid drifted and the slots hold the wrong faces. A couple of
 * flagged cells is just a badge or a shop sign on one costume: the other eleven
 * portraits are fine, and re-rolling them is what used to burn ~2 extra grid
 * images per game (~$0.13) without reliably converging. */
export function isSystemicFailure(verdicts: SliceVerdict[]): boolean {
    const textViolations = verdicts.filter(v => v.hasText).length;
    const genderMismatches = verdicts.filter(v => v.genderMismatch).length;
    return textViolations > verdicts.length / 2 || genderMismatches > 1;
}

/** One image call: draw the grid, slice it, judge every slice. */
async function generateCandidateRound(
    apiKey: string,
    game: AvatarSubject,
    sharp: any,
    cells: AvatarCell[],
    cols: number,
    rows: number,
    realCount: number,
    logContext: Record<string, unknown>,
    ledger: SpendLedger,
): Promise<{candidates: AvatarCandidate[]; costUSD: number; systemic: boolean; problems: string[]}> {
    const grid = await generateImage(apiKey, buildPrompt(game, cells, cols, rows), "4:3");
    ledger.spentUSD += grid.costUSD;
    const slices = await sliceGrid(sharp, grid.buffer, cells, realCount, cols);

    let verdicts: SliceVerdict[];
    try {
        verdicts = await verifySlices(apiKey, slices);
    } catch (verifyError: any) {
        // A verifier outage must never cost the player their portraits: accept
        // the crops unjudged (that is also what the old pipeline did).
        logger.warn(`Slice verifier unavailable, accepting slices unjudged`, {...logContext, error: verifyError.message});
        verdicts = slices.map(() => ({hasText: false, genderMismatch: false}));
    }

    return {
        candidates: slices.map((sl, i) => ({
            key: sl.key,
            jpeg: sl.jpeg,
            flagged: verdicts[i].hasText || verdicts[i].genderMismatch,
            problem: verdicts[i].problem,
        })),
        costUSD: grid.costUSD,
        systemic: isSystemicFailure(verdicts),
        problems: verdicts.map(v => v.problem).filter((p): p is string => !!p),
    };
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

export type AvatarVariantMap = Record<string, {n: number; sel: number}>;

/** Stores every candidate in the avatarVariants subcollection and copies the
 * selected one into avatars/{key}, where all the existing readers look (the
 * image route, illustration reference portraits, the chat and cinematic UIs) —
 * that copy is why variants needed no changes anywhere downstream.
 * `existing` carries the counts already stored, so a reroll appends. Works on
 * any parent doc with those two subcollections — a game or a preview draft;
 * `docExtras` is merged into every image doc (the draft's TTL field). */
export async function writeCandidates(
    gameRef: firestore.DocumentReference,
    rounds: AvatarCandidate[][],
    existing: AvatarVariantMap,
    extraWrites: PendingWrite[] = [],
    docExtras: Record<string, any> = {},
): Promise<{variants: AvatarVariantMap; versions: Record<string, number>}> {
    const byKey = new Map<string, AvatarCandidate[]>();
    for (const round of rounds) {
        for (const candidate of round) {
            const list = byKey.get(candidate.key) ?? [];
            list.push(candidate);
            byKey.set(candidate.key, list);
        }
    }

    const now = Date.now();
    const writes: PendingWrite[] = [...extraWrites];
    const variants: AvatarVariantMap = {...existing};
    const versions: Record<string, number> = {};

    for (const [key, list] of byKey) {
        const offset = existing[key]?.n ?? 0;
        list.forEach((candidate, i) => writes.push({
            ref: gameRef.collection(AVATAR_VARIANTS_COLLECTION).doc(avatarVariantKey(key, offset + i)),
            data: {
                data: candidate.jpeg.toString('base64'),
                mime: 'image/jpeg',
                flagged: candidate.flagged,
                ...(candidate.problem ? {problem: candidate.problem} : {}),
                createdAt: now,
                ...docExtras,
            },
        }));
        const localSel = chooseSelected(list);
        variants[key] = {n: offset + list.length, sel: offset + localSel};
        versions[key] = now;
        writes.push({
            ref: gameRef.collection('avatars').doc(key),
            data: {data: list[localSel].jpeg.toString('base64'), mime: 'image/jpeg', createdAt: now, ...docExtras},
        });
    }

    await commitChunked(writes);
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
function buildPaddedCells(game: AvatarSubject): {cells: AvatarCell[]; cols: number; rows: number; realCount: number} {
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
    rounds: AvatarCandidate[][];
    // welcome + night, or empty when scenes weren't requested or failed
    // (scene failure never blocks portraits).
    scenes: {key: string; jpeg: Buffer}[];
}

/**
 * Draws a set for a subject: the portrait grid (draw → slice → judge, keeping
 * every round's crops) and, when asked, the scene pair in parallel. Pure
 * drawing — no Firestore, no billing — so the game generator, the in-game
 * reroll and the preview draft all run the same pipeline and differ only in
 * where the result lands.
 *
 * `maxRounds` > 1 allows another draw when a round failed as a whole image (a
 * labeled character-card layout, or a drifted grid); a few flagged cells are
 * shipped as-is with their alternates one arrow-click away on the character
 * card. `onStage` fires as each half lands, for progress display.
 */
export async function drawIllustrationSet(
    apiKey: string,
    subject: AvatarSubject,
    opts: {
        withScenes: boolean;
        maxRounds: number;
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

    const rounds: AvatarCandidate[][] = [];
    for (let attempt = 1; attempt <= opts.maxRounds; attempt++) {
        const round = await generateCandidateRound(apiKey, subject, sharp, cells, cols, rows, realCount, logContext, ledger);
        rounds.push(round.candidates);
        if (round.problems.length > 0) {
            logger.warn(`Avatar grid slices flagged (attempt ${attempt})`, {...logContext, systemic: round.systemic, problems: round.problems});
        }
        if (!round.systemic) break;
    }
    await opts.onStage?.('portraits');

    return {rounds, scenes: await scenePromise};
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

        const drawn = await drawIllustrationSet(apiKey, claimed, {withScenes: true, maxRounds: 3, ledger, logContext: {gameId}});
        const {variants, versions} = await writeCandidates(gameRef, drawn.rounds, {}, sceneWritesFor(gameRef, drawn.scenes));

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

        logger.info(`Avatars generated for game ${gameId}`, {gameId, portraits: Object.keys(variants).length, rounds: drawn.rounds.length, scenes: drawn.scenes.length, costUSD});
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
 * Owner-triggered portrait reroll. Draws exactly ONE new grid — never the
 * three-attempt loop — because a reroll the player clicked must cost exactly
 * what the button promised. Its crops are appended to each character's
 * candidate list and become the shown portraits; the previous ones stay
 * reachable through the arrows on the character card.
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

        const drawn = await drawIllustrationSet(apiKey, claimed, {withScenes: false, maxRounds: 1, ledger, logContext: {gameId, reroll: true}});
        const {variants, versions} = await writeCandidates(gameRef, drawn.rounds, existing);

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
            data: {data: data.data, mime: data.mime || 'image/jpeg', flagged: false, createdAt: data.createdAt || Date.now()},
        });
        variants[keys[i]] = {n: 1, sel: 0};
    });
    await commitChunked(writes);
    return variants;
}

/**
 * Switches which candidate a character shows: copies that candidate's bytes
 * into avatars/{key} (the doc every reader already looks at) and bumps only
 * this key's cache-buster. Returns the new per-key version, or null when the
 * caller isn't the owner or the index doesn't exist.
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
    if (!entry || index < 0 || index >= entry.n) return null;
    if (entry.sel === index) return {key, sel: index, version: game.avatarVersions?.[key] ?? game.avatarsVersion ?? 0};

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
