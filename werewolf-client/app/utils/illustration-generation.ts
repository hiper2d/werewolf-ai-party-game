import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {
    Game,
    GameMessage,
    GAME_MASTER,
    MessageType,
    RECIPIENT_ALL,
    SCENE_WELCOME_KEY,
    USER_TIERS,
    nightIllustrationKey,
} from "@/app/api/game-models";
import {addMessageToChatAndSaveToDb} from "@/app/api/game-actions";
import {getUserTierAndApiKeys} from "@/app/utils/tier-utils";
import {updateUserMonthlySpending, deductBalance} from "@/app/api/user-actions";
import {PAID_TIER_MARKUP} from "@/app/config/credit-packages";
import {API_KEY_CONSTANTS, IMAGE_MODEL_CONSTANTS, IMAGE_MODEL_PRICING} from "@/app/ai/ai-models";
import {generateImage} from "@/app/utils/avatar-generation";
import {logger} from "@/app/utils/logger";
import {sanitizeArtStyle} from "@/app/utils/art-style";

/**
 * Whether a game gets occasional mid-game illustrations. Free for everyone for
 * now; planned to become a paid-tier perk (gate on game.createdWithTier here —
 * this is the ONLY spot that decides, the GM-side logic stays tier-agnostic).
 * Requires a finished avatar set: the welcome scene is the style reference
 * that keeps every illustration in the game's established look.
 */
export function midGameImagesEnabled(game: Game): boolean {
    return game.avatarsStatus === 'ready';
}

// Model and pricing come from the image-pipeline config (ai-models.ts). A
// brief is a few hundred tokens, so it adds well under $0.001 — but it still
// counts into totalImagesCost.
const BRIEF_MODEL = IMAGE_MODEL_CONSTANTS.ILLUSTRATION_BRIEF;
const BRIEF_INPUT_PRICE_PER_M = IMAGE_MODEL_PRICING[BRIEF_MODEL].inputPricePerM;
const BRIEF_OUTPUT_PRICE_PER_M = IMAGE_MODEL_PRICING[BRIEF_MODEL].outputPricePerM;

/**
 * A cheap "illustrator's assistant" pass: turns the GM's narration plus the
 * cast list into a CONCRETE scene description that names the characters and
 * what exactly they are doing — raw narration alone yields generic mood
 * pieces. Failure falls back to the narration excerpt (never blocks).
 */
async function writeIllustrationBrief(apiKey: string, game: Game, story: string): Promise<{brief: string; costUSD: number} | null> {
    const cast = [
        ...game.bots.map(b => `${b.name} (${b.gender}): ${b.story.slice(0, 160)}`),
        `${game.humanPlayerName}: the protagonist of this tale`,
    ].join('\n');
    const prompt = `You are the illustrator's assistant for a social-deduction story game. Below are the setting, the cast, and the narration of last night's events. Write a concrete visual brief (2-4 sentences) for ONE illustration of the night's most dramatic moment: name the specific characters involved, describe exactly what each is doing, where in the setting it happens, and the mood. Only include characters that appear in the narration. Never reveal hidden roles beyond what the narration itself states. Reply with the brief only, no preamble.

Setting — "${game.theme}": ${game.description}

Cast:
${cast}

Last night's narration:
${story.slice(0, 1500)}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${BRIEF_MODEL}:generateContent`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
        body: JSON.stringify({contents: [{parts: [{text: prompt}]}]}),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const brief = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
    if (!brief) return null;
    const usage = json.usageMetadata || {};
    const costUSD = parseFloat((
        (usage.promptTokenCount || 0) / 1_000_000 * BRIEF_INPUT_PRICE_PER_M +
        ((usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)) / 1_000_000 * BRIEF_OUTPUT_PRICE_PER_M
    ).toFixed(6));
    return {brief, costUSD};
}

/** Participant names mentioned in the text, in order of first appearance. */
function mentionedParticipants(game: Game, text: string): string[] {
    return [...game.bots.map(b => b.name), game.humanPlayerName]
        .map(name => ({name, at: text.indexOf(name)}))
        .filter(x => x.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map(x => x.name);
}

function buildIllustrationPrompt(game: Game, sceneDescription: string, characterNames: string[]): string {
    const characterLine = characterNames.length > 0
        ? `The named characters must be recognizable — match each one's face, hair and clothing to their labeled reference portrait. `
        : `Characters may be shown from a distance or partially obscured. `;
    // The establishing-shot reference already carries the game's look; the
    // player's art direction is restated for the case where that reference is
    // missing (the scene pair failed at creation) so the style still holds.
    const artStyle = sanitizeArtStyle(game.artStyle);
    const styleLine = artStyle ? `\n\nArt style, chosen by the player: "${artStyle}"` : '';
    return `Illustrate this moment from a social deduction story. Cinematic composition, atmospheric night lighting.

Setting — "${game.theme}": ${game.description}${styleLine}

Scene to depict:
${sceneDescription}

${characterLine}Match the illustration style and palette of the establishing-shot reference exactly — this is another scene from the same story. The portrait references contain nameplate labels — do NOT reproduce them: no text, lettering, name tags or labels anywhere in the image.`;
}

/**
 * Generates ONE illustration for an eventful night and posts it to the chat as
 * a GM_ILLUSTRATION message ({sceneKey}). Runs post-response via after(), so
 * nothing here may block or fail the night flow:
 * - The message is written only AFTER the image doc is committed — a refresh or
 *   crash mid-generation leaves no trace, never a broken message.
 * - Idempotency: the image doc claims the (day, summary message) pair in a
 *   transaction; a duplicate trigger for the same summary message is a no-op,
 *   while a replayed night (new summary message id) regenerates.
 * - Errors are logged and swallowed: an illustration is decoration, the game
 *   never learns it was attempted.
 */
export async function runNightIllustration(
    gameId: string,
    userEmail: string,
    nightDay: number,
    story: string,
    summaryMsgId: string,
    // The message's day: normally nightDay + 1, so the image opens the NEXT
    // morning's discussion where players are actually looking (the night
    // summary closes day N, then the counter increments). When the night ends
    // the game there is no next day — the caller passes nightDay to keep the
    // image visible under the final summary.
    postDay: number,
): Promise<void> {
    if (!db) return;
    const gameRef = db.collection('games').doc(gameId);
    const key = nightIllustrationKey(nightDay);
    const imageRef = gameRef.collection('avatars').doc(key);

    try {
        const claimed = await db.runTransaction(async tx => {
            const snap = await tx.get(imageRef);
            if (snap.exists && (snap.data() as any)?.msgId === summaryMsgId) return false;
            // Placeholder without `data`: the serving route 404s it, and a
            // concurrent duplicate trigger sees msgId and bails.
            tx.set(imageRef, {msgId: summaryMsgId, generating: true, createdAt: Date.now()});
            return true;
        });
        if (!claimed) return;

        const gameSnap = await gameRef.get();
        if (!gameSnap.exists) return;
        const game = {...(gameSnap.data() as Game), id: gameSnap.id};

        const {tier, apiKeys} = await getUserTierAndApiKeys(userEmail);
        const apiKey = apiKeys[API_KEY_CONSTANTS.GOOGLE];
        if (!apiKey) throw new Error('No Google API key available for illustration generation');

        // Concrete scene description from the brief writer; the raw narration
        // excerpt is the fallback.
        const briefResult = await writeIllustrationBrief(apiKey, game, story).catch(() => null);
        const sceneDescription = briefResult?.brief ?? (story.length > 700 ? story.slice(0, 700) + '…' : story);

        // References: the welcome scene anchors style/location (its absence —
        // scene pair failed at creation — degrades to unanchored but themed),
        // and the portraits of the characters in the scene anchor their faces.
        const references: {label: string; jpeg: Buffer}[] = [];
        const welcomeSnap = await gameRef.collection('avatars').doc(SCENE_WELCOME_KEY).get();
        if (welcomeSnap.exists && (welcomeSnap.data() as any)?.data) {
            references.push({
                label: 'Establishing-shot reference — the same story\'s setting, style and palette:',
                jpeg: Buffer.from((welcomeSnap.data() as any).data, 'base64'),
            });
        }
        const characterNames = mentionedParticipants(game, sceneDescription).slice(0, 3);
        const portraitSnaps = await Promise.all(characterNames.map(name => gameRef.collection('avatars').doc(name).get()));
        const portraitNames: string[] = [];
        portraitSnaps.forEach((snap, i) => {
            if (snap.exists && (snap.data() as any)?.data) {
                portraitNames.push(characterNames[i]);
                references.push({
                    label: `Reference portrait of ${characterNames[i]}:`,
                    jpeg: Buffer.from((snap.data() as any).data, 'base64'),
                });
            }
        });

        const image = await generateImage(apiKey, buildIllustrationPrompt(game, sceneDescription, portraitNames), "3:2", {references, imageSize: '1K'});

        const sharp = (await import('sharp')).default;
        const jpeg = await sharp(image.buffer).resize({width: 1024, withoutEnlargement: true}).jpeg({quality: 80}).toBuffer();

        const costUSD = parseFloat((image.costUSD + (briefResult?.costUSD ?? 0)).toFixed(6));
        const batch = db.batch();
        batch.set(imageRef, {
            data: jpeg.toString('base64'),
            mime: 'image/jpeg',
            msgId: summaryMsgId,
            createdAt: Date.now(),
        });
        batch.update(gameRef, {
            totalGameCost: firestore.FieldValue.increment(costUSD),
            totalImagesCost: firestore.FieldValue.increment(costUSD),
        });
        await batch.commit();

        // Image bytes are in place — now the chat message can safely appear.
        const message: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: GAME_MASTER,
            msg: {sceneKey: key},
            messageType: MessageType.GM_ILLUSTRATION,
            day: postDay,
            timestamp: Date.now(),
            cost: costUSD,
        };
        await addMessageToChatAndSaveToDb(message, gameId);

        if (tier === USER_TIERS.PAID && costUSD > 0) {
            const chargedAmount = parseFloat((costUSD * (1 + PAID_TIER_MARKUP)).toFixed(6));
            await deductBalance(userEmail, chargedAmount);
            await updateUserMonthlySpending(userEmail, chargedAmount, tier);
        } else if (costUSD > 0) {
            await updateUserMonthlySpending(userEmail, costUSD, tier);
        }

        logger.info(`Night illustration generated for game ${gameId}`, {gameId, nightDay, postDay, costUSD});
    } catch (error: any) {
        logger.warn(`Night illustration failed for game ${gameId} (decorative, ignored)`, {gameId, nightDay, error: error.message});
    }
}
