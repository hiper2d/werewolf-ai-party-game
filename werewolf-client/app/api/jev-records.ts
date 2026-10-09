/**
 * Durable records of every Jev call, one Firestore doc per call, in two top-level collections.
 *
 * `jevRouterCalls` — the speaker router: the full state the judge saw, the questions, its raw answers,
 * the decision code made from them and the config in force. Better Stack gets the same row
 * but keeps it for days; this is what the selection logic is tuned and replayed against
 * (scripts/jev-replay.ts). Written best-effort after the selection — never blocks or fails a game.
 *
 * `jevScreenCalls` — the content screen (app/api/jev-screen.ts): the human text, the exact
 * state and questions, the raw answers, the verdict and the thresholds and prompt version
 * that produced it. The rows are the material for tuning the thresholds in monitor mode and
 * for checking, after a provider refusal, whether a player message was let through or the
 * bots drifted on their own (scripts/jev-screen-report.ts). Flat on purpose: streams into
 * BigQuery as-is when statistics outgrow Firestore.
 *
 * `expireAt` enables a Firestore TTL policy (console step, like requestStats): 180 days.
 */

import { db } from "@/firebase/server";
import { logger } from "@/app/utils/logger";

export const JEV_ROUTER_CALLS_COLLECTION = 'jevRouterCalls';
export const JEV_SCREEN_CALLS_COLLECTION = 'jevScreenCalls';
const JEV_RECORD_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface JevRouterCallRecord {
    gameId: string;
    userId: string;
    day: number;
    status: 'ok' | 'error';
    model: string;
    state: Record<string, unknown>;
    questions: Record<string, unknown>;
    answers?: Record<string, unknown>;
    decision?: Record<string, unknown>;
    inputTokens?: number;
    costUSD?: number;
    durationMs?: number;
    error?: string;
    httpStatus?: number;
    /**
     * The other judge's answer to the same request (since 2026-10-09 both are asked at once when
     * both keys exist, to compare who routes better). The row's own fields are the judge that
     * decided — Jev, or OpenAI Decisions when Jev failed; on an `error` row (both failed) they
     * carry Jev's error and this Decisions'. Never acted on. When Jev decided, this is written a
     * moment after the row, once the slower call lands, so a row can briefly lack it.
     */
    shadow?: JevRouterShadow;
}

export interface JevRouterShadow {
    model: string;
    answers?: Record<string, unknown>;
    /** The speaker set this judge's answers compose to, drawn with the SAME random numbers as the
     * decider's (count, tie-breaks), so a difference in `selected` is the judges' difference. */
    decision?: Record<string, unknown>;
    inputTokens?: number;
    costUSD?: number;
    durationMs?: number;
    error?: string;
    httpStatus?: number;
}

export interface StoredJevRouterCall extends JevRouterCallRecord {
    id: string;
    createdAt: number;
}

/** Firestore rejects `undefined`; drop those keys (top level is enough — nested data is JSON from the API). */
function compact<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Returns the new row's id (null when not saved), so a late shadow can be attached to it. */
export async function saveJevRouterCall(record: JevRouterCallRecord): Promise<string | null> {
    if (!db) {
        return null;
    }
    const now = Date.now();
    try {
        const ref = await db.collection(JEV_ROUTER_CALLS_COLLECTION).add(compact({
            ...record,
            shadow: record.shadow ? compact(record.shadow as unknown as Record<string, unknown>) : undefined,
            createdAt: now,
            expireAt: new Date(now + JEV_RECORD_TTL_MS),
        }));
        return ref.id;
    } catch (error: any) {
        logger.warn('Jev router record not saved', { gameId: record.gameId, error: error?.message });
        return null;
    }
}

/** Attach the shadow judge's answer to a saved router row (it lands after the decider's). */
export async function saveJevRouterShadow(id: string, gameId: string, shadow: JevRouterShadow): Promise<void> {
    if (!db) {
        return;
    }
    try {
        await db.collection(JEV_ROUTER_CALLS_COLLECTION).doc(id).update({ shadow: compact(shadow as unknown as Record<string, unknown>) });
    } catch (error: any) {
        logger.warn('Jev router shadow not saved', { gameId, error: error?.message });
    }
}

/** All recorded calls of one game, oldest first. No composite index needed: sorted in memory. */
export async function listJevRouterCalls(gameId: string): Promise<StoredJevRouterCall[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const snapshot = await db.collection(JEV_ROUTER_CALLS_COLLECTION).where('gameId', '==', gameId).get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Omit<StoredJevRouterCall, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getJevRouterCall(id: string): Promise<StoredJevRouterCall | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const doc = await db.collection(JEV_ROUTER_CALLS_COLLECTION).doc(id).get();
    return doc.exists ? { id: doc.id, ...(doc.data() as Omit<StoredJevRouterCall, 'id'>) } : null;
}

export type JevScreenSource = 'chat' | 'preview';
export type JevScreenVerdict = 'ok' | 'grey' | 'would_block' | 'error';

export interface JevScreenCallRecord {
    /** null for a preview: the game does not exist yet. */
    gameId: string | null;
    userEmail: string;
    source: JevScreenSource;
    day: number | null;
    /** The human text as screened (already clamped to the input limits). */
    text: string;
    state: Record<string, unknown>;
    questions: Record<string, unknown>;
    promptVersion: string;
    model: string;
    answers?: Record<string, unknown>;
    inputTokens?: number;
    costUSD?: number;
    durationMs?: number;
    verdict: JevScreenVerdict;
    /** Which flag or the score put it there; null when ok. */
    reason: string | null;
    riskScore: number | null;
    /** Probability mass on the top two risk levels. */
    highRisk: number | null;
    flags: Record<string, number> | null;
    /** The config in force when the verdict was made. */
    thresholds: Record<string, unknown>;
    mode: 'monitor' | 'enforce';
    /** True only when the input was actually rejected (enforce mode, would_block). */
    enforced: boolean;
    error?: string;
    httpStatus?: number;
    /**
     * The other judge's answer to the same input (since 2026-10-09 both are asked at once, to
     * collect paired verdicts). The row's own fields are the judge that decided — Jev, or OpenAI
     * Decisions when Jev failed; on an `error` row (both failed) they carry Jev's error and this
     * Decisions'. Its verdict is recorded only, never acted on. Missing on older rows and when only
     * one judge has a key.
     */
    shadow?: JevScreenShadow;
}

export interface JevScreenShadow {
    model: string;
    verdict: JevScreenVerdict;
    reason: string | null;
    riskScore: number | null;
    highRisk: number | null;
    flags: Record<string, number> | null;
    answers?: Record<string, unknown>;
    inputTokens?: number;
    costUSD?: number;
    durationMs?: number;
    error?: string;
    httpStatus?: number;
}

export interface StoredJevScreenCall extends JevScreenCallRecord {
    id: string;
    createdAt: number;
}

export async function saveJevScreenCall(record: JevScreenCallRecord): Promise<void> {
    if (!db) {
        return;
    }
    const now = Date.now();
    try {
        await db.collection(JEV_SCREEN_CALLS_COLLECTION).add(compact({
            ...record,
            shadow: record.shadow ? compact(record.shadow as unknown as Record<string, unknown>) : undefined,
            createdAt: now,
            expireAt: new Date(now + JEV_RECORD_TTL_MS),
        }));
    } catch (error: any) {
        logger.warn('Jev screen record not saved', { gameId: record.gameId, source: record.source, error: error?.message });
    }
}

/** Every screen call since `sinceMs`, oldest first. Single-field range query: no composite index needed. */
export async function listJevScreenCallsSince(sinceMs: number): Promise<StoredJevScreenCall[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const snapshot = await db.collection(JEV_SCREEN_CALLS_COLLECTION).where('createdAt', '>=', sinceMs).get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Omit<StoredJevScreenCall, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt);
}

/** All screen calls of one game, oldest first. */
export async function listJevScreenCallsForGame(gameId: string): Promise<StoredJevScreenCall[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const snapshot = await db.collection(JEV_SCREEN_CALLS_COLLECTION).where('gameId', '==', gameId).get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Omit<StoredJevScreenCall, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt);
}
