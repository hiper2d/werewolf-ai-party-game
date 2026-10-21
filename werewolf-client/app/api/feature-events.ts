/**
 * Feature-use events: one Firestore row per deliberate player action that the
 * game state does not already record — a portrait reframe, a reroll, picking
 * another candidate, drawing illustrations on the preview. Spend rows
 * (`requestStats`) say what the platform paid for; these say what players
 * chose to do. Flat on purpose, like the Jev records: `scripts/feature-events-report.ts`
 * reads them and they stream into BigQuery as-is if they ever outgrow Firestore.
 *
 * Written best-effort after the action succeeded — never blocks or fails it.
 * Better Stack gets a `FEATURE_USED` line with the feature and game but not
 * the user. `expireAt` enables a Firestore TTL policy (console step, like
 * requestStats): 180 days.
 */

import { db } from "@/firebase/server";
import { logger } from "@/app/utils/logger";

export const FEATURE_EVENTS_COLLECTION = 'featureEvents';
const FEATURE_EVENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export type FeatureName =
    | 'avatar_reframe'         // moved a portrait's crop (game or preview draft)
    | 'avatar_reroll'          // redrew the whole cast's portraits
    | 'avatar_variant_select'  // switched a character to another drawn candidate
    | 'draft_illustrations'    // drew the portraits + scenes on the preview (paid)
    | 'voice_tts'              // one spoken line (detail.source says where: chat, cinematic, cinematic_auto, preview, audition)
    | 'voice_stt'              // one dictated message
    | 'game_created';          // the form's choices: tier, players, voiceProvider, gameMode, longReplies, artStyle, gameMaster

/**
 * Where a spoken line was asked for. `cinematic_auto` is the auto-read in
 * cinematic mode (nobody clicked); the rest are deliberate clicks: a line in
 * the chat, a line in cinematic mode, the story on the new-game preview, a
 * voice sample on a character card.
 */
export type SpeechSource = 'chat' | 'cinematic' | 'cinematic_auto' | 'preview' | 'audition';

export interface FeatureEvent {
    userId: string;
    feature: FeatureName;
    /** The game the action was taken in; absent for preview-draft actions. */
    gameId?: string;
    /** Small, flat, feature-specific facts: which character, which target, which index. */
    detail?: Record<string, string | number | boolean>;
}

export interface StoredFeatureEvent extends FeatureEvent {
    id: string;
    createdAt: number;
}

export async function recordFeatureEvent(event: FeatureEvent): Promise<void> {
    logger.info(`FEATURE_USED: ${event.feature}`, { feature: event.feature, gameId: event.gameId, ...event.detail });
    if (!db) {
        return;
    }
    const now = Date.now();
    try {
        await db.collection(FEATURE_EVENTS_COLLECTION).add({
            userId: event.userId,
            feature: event.feature,
            ...(event.gameId ? { gameId: event.gameId } : {}),
            ...(event.detail ? { detail: event.detail } : {}),
            createdAt: now,
            expireAt: new Date(now + FEATURE_EVENT_TTL_MS),
        });
    } catch (error: any) {
        logger.warn('Feature event not saved', { feature: event.feature, gameId: event.gameId, error: error?.message });
    }
}

/** Events since a moment, oldest first (reports and scripts). */
export async function listFeatureEventsSince(sinceMs: number): Promise<StoredFeatureEvent[]> {
    if (!db) {
        return [];
    }
    const snapshot = await db.collection(FEATURE_EVENTS_COLLECTION)
        .where('createdAt', '>=', sinceMs)
        .orderBy('createdAt', 'asc')
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<StoredFeatureEvent, 'id'>) }));
}
