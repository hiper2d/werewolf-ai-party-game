import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {Game, USER_TIERS, AVATAR_GM_KEY, SCENE_WELCOME_KEY, SCENE_NIGHT_KEY} from "@/app/api/game-models";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {updateUserMonthlySpending, deductBalance} from "@/app/api/user-actions";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";
import {API_KEY_CONSTANTS, IMAGE_MODEL_CONSTANTS, IMAGE_MODEL_PRICING} from "@/app/ai/ai-models";
import {logger} from "@/app/utils/logger";

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
    label: string;    // Nameplate text drawn into the image
    prompt: string;   // One-line visual description for this cell
}

function buildCells(game: Game): AvatarCell[] {
    const cells: AvatarCell[] = game.bots.map(bot => ({
        key: bot.name,
        label: bot.name,
        prompt: `(${bot.gender}) "${bot.name}" — ${bot.story}`,
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

function buildPrompt(game: Game, cells: AvatarCell[], cols: number, rows: number): string {
    const cellLines = cells.map(
        (c, i) => `Cell ${i + 1}: ${c.prompt}. Small nameplate label "${c.label}" at the bottom of the cell, its own distinct flat solid muted background color.`
    ).join("\n");

    return `A character portrait sheet for a social deduction game, drawn as a single image: a precise grid of exactly ${cells.length} rectangular cells, ${cols} columns and ${rows} rows, all cells exactly equal size, separated by thin dark divider lines. Each cell contains one bust portrait (head and shoulders) of a different character.

Setting — "${game.theme}": ${game.description}

Choose ONE cohesive illustration style that fits this setting and apply it consistently to every portrait: same rendering technique, same palette family, same lighting. Every face must be distinct and memorable, and match its character description. No character may span more than one cell. Give each cell its own flat solid muted desaturated background color, different from its neighbors. Row-major order, left to right, top to bottom:

${cellLines}

No text anywhere except the nameplates.`;
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
function buildScenePrompt(game: Game): string {
    return `A single image divided into exactly 2 equal horizontal panels, one above the other, separated by a thin dark divider line. Both panels depict the same place, in one cohesive illustration style that fits this setting — atmospheric establishing shots, no people in close-up, cinematic composition.

Setting — "${game.theme}": ${game.description}

Top panel: the setting at the story's opening — the gathering place of the characters, inviting yet with a first hint of unease.
Bottom panel: the same setting at night — dark, ominous, something predatory hidden in the shadows.

No text anywhere in the image.`;
}

// Cheap vision model that transcribes the nameplates baked into each sliced
// avatar — the geometric proof that slicing matched the model's actual grid
// (a misaligned grid puts the wrong or no nameplate in a crop).
const VERIFY_MODEL = IMAGE_MODEL_CONSTANTS.VERIFIER;

interface AvatarSlice {
    key: string;
    label: string;
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
        slices.push({key: cells[i].key, label: cells[i].label, jpeg});
    }
    return slices;
}

/** Reads the nameplate out of every sliced avatar and compares it to the
 * expected character name. One mismatch is tolerated (transcription flake);
 * more means the grid layout drifted and the whole set must be regenerated. */
async function verifyNameplates(apiKey: string, slices: AvatarSlice[]): Promise<{ok: boolean; mismatches: string[]}> {
    const parts: any[] = [{
        text: `Each image below is a character portrait with a nameplate label near the bottom. Transcribe each nameplate. Reply with exactly ${slices.length} lines, formatted "<number>: <nameplate text>" (NONE if no nameplate is visible). No other text.`,
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
    if (!res.ok) throw new Error(`Nameplate verification failed: HTTP ${res.status}`);
    const json = await res.json();
    const text: string = (json.candidates?.[0]?.content?.parts || []).map((pt: any) => pt.text || '').join('\n');

    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byIndex = new Map<number, string>();
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*(\d+)\s*[:.\-]\s*(.*)$/);
        if (m) byIndex.set(parseInt(m[1], 10), m[2]);
    }
    const mismatches = slices
        .filter((sl, i) => {
            const got = norm(byIndex.get(i + 1) || '');
            const want = norm(sl.label);
            return !(got && (got.includes(want) || want.includes(got)));
        })
        .map(sl => sl.label);
    return {ok: mismatches.length <= 1, mismatches};
}

/**
 * Core of themed avatar generation — see generateGameAvatars (avatar-actions.ts)
 * for the flow description. Split out from the server action so scripts (tests,
 * backfills) can run it with an explicit owner email.
 *
 * Returns the game's final avatarsStatus (a PLAIN object — raw Firestore doc
 * data contains Timestamp class instances that server actions can't serialize
 * to client components), or null when the game doesn't exist.
 */
export interface AvatarGenerationResult {
    avatarsStatus: Game['avatarsStatus'];
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
        return snap.exists ? {avatarsStatus: (snap.data() as Game).avatarsStatus} : null;
    }

    try {
        const {tier, apiKeys} = await getUserTierAndApiKeys(userEmail);
        const apiKey = apiKeys[API_KEY_CONSTANTS.GOOGLE];
        if (!apiKey) throw new Error('No Google API key available for avatar generation');

        const cells = buildCells(claimed);
        const {cols, rows} = gridFor(cells.length);
        // The model reliably fills FULL grids but sometimes ignores "leave the
        // last cells empty", which shifts every row and corrupts the slicing.
        // Pad with throwaway filler characters instead; they're never stored.
        const realCount = cells.length;
        for (let i = cells.length; i < cols * rows; i++) {
            cells.push({
                key: `__filler${i}`,
                label: 'Stranger',
                prompt: `"Stranger" — an anonymous hooded figure fitting the setting, face hidden in shadow`,
            });
        }

        // The scene pair (optional — its failure never blocks avatars) runs in
        // parallel with the grid work.
        const scenePromise = generateImage(apiKey, buildScenePrompt(claimed), "3:4")
            .then(v => ({status: 'fulfilled' as const, value: v}))
            .catch(e => ({status: 'rejected' as const, reason: e}));

        // sharp is a native module; dynamic import keeps it out of the
        // client/server bundle graph.
        const sharp = (await import('sharp')).default;

        // Generate → slice → verify, with ONE retry: the nameplate check reads
        // the label baked into every crop, so a drifted grid (model drew a
        // different layout than requested) can never reach players.
        let slices: AvatarSlice[] = [];
        let gridCostUSD = 0;
        let verified = false;
        for (let attempt = 1; attempt <= 2 && !verified; attempt++) {
            const grid = await generateImage(apiKey, buildPrompt(claimed, cells, cols, rows), "4:3");
            gridCostUSD += grid.costUSD;
            slices = await sliceGrid(sharp, grid.buffer, cells, realCount, cols);
            try {
                const check = await verifyNameplates(apiKey, slices);
                if (check.ok) {
                    verified = true;
                } else {
                    logger.warn(`Avatar grid failed nameplate verification (attempt ${attempt})`, {gameId, mismatches: check.mismatches});
                }
            } catch (verifyError: any) {
                // Verifier outage must not block avatars — accept the slices.
                logger.warn(`Nameplate verifier unavailable, accepting slices`, {gameId, error: verifyError.message});
                verified = true;
            }
        }
        if (!verified) throw new Error('Avatar grid failed nameplate verification twice');
        const sceneResult = await scenePromise;
        const batch = db.batch();
        for (const slice of slices) {
            batch.set(gameRef.collection('avatars').doc(slice.key), {
                data: slice.jpeg.toString('base64'),
                mime: 'image/jpeg',
                createdAt: Date.now(),
            });
        }

        // Scene pair: stacked panels sliced in half → welcome (top), night
        // (bottom). Downscale to 1024 wide — plenty for a chat bubble.
        if (sceneResult.status === 'fulfilled') {
            const scenes = sceneResult.value.buffer;
            const sceneMeta = await sharp(scenes).metadata();
            const w = sceneMeta.width || 0;
            const halfH = Math.floor((sceneMeta.height || 0) / 2);
            const divider = 6; // skip the divider line between panels
            for (const [key, top] of [[SCENE_WELCOME_KEY, 0], [SCENE_NIGHT_KEY, halfH + divider]] as [string, number][]) {
                const jpeg = await sharp(scenes)
                    .extract({left: 0, top, width: w, height: halfH - divider})
                    .resize({width: 1024})
                    .jpeg({quality: 80})
                    .toBuffer();
                batch.set(gameRef.collection('avatars').doc(key), {
                    data: jpeg.toString('base64'),
                    mime: 'image/jpeg',
                    createdAt: Date.now(),
                });
            }
        } else {
            logger.warn(`Scene image generation failed for game ${gameId}`, {gameId, error: sceneResult.reason?.message});
        }

        // Bill like the story preview: raw cost into the game total, cost+markup
        // off the paid-tier balance.
        const costUSD = parseFloat((
            gridCostUSD +
            (sceneResult.status === 'fulfilled' ? sceneResult.value.costUSD : 0)
        ).toFixed(6));

        batch.update(gameRef, {
            avatarsStatus: 'ready',
            avatarsVersion: Date.now(),
            totalGameCost: firestore.FieldValue.increment(costUSD),
            // Image spending is tracked separately from LLM calls so its real
            // cost stays visible (totalImagesCost is a subset of totalGameCost).
            totalImagesCost: firestore.FieldValue.increment(costUSD),
        });
        await batch.commit();

        if (tier === USER_TIERS.PAID && costUSD > 0) {
            const chargedAmount = parseFloat((costUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
            await deductBalance(userEmail, chargedAmount);
            await updateUserMonthlySpending(userEmail, chargedAmount, tier);
        } else if (costUSD > 0) {
            await updateUserMonthlySpending(userEmail, costUSD, tier);
        }

        logger.info(`Avatars generated for game ${gameId}`, {gameId, cells: cells.length, costUSD});
    } catch (error: any) {
        // Avatars are decorative: never surface errorState, just mark failed so
        // the UI keeps its initial-letter fallback and a later visit may retry.
        logger.error(`Avatar generation failed for game ${gameId}`, {gameId, error: error.message});
        await gameRef.update({avatarsStatus: 'failed'});
    }

    const snap = await gameRef.get();
    return snap.exists ? {avatarsStatus: (snap.data() as Game).avatarsStatus} : null;
}
