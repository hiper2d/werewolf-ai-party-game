/**
 * Minimal client for typesafe.ai's "System One" model (Jev).
 *
 * Jev is a judge, not a chat model: it takes a `state` (text / JSON) plus named questions and
 * returns calibrated answers for all of them in one sub-second call. It cannot generate text,
 * count or do arithmetic — anything numeric stays in code. Docs: https://docs.typesafe.ai/llms.txt
 *
 * Kept as a plain fetch client (no SDK) — the surface we use is three question types and one
 * endpoint. It does not fit `AbstractAgent` (no messages, no output tokens), so it lives in the
 * app rather than in @hiper2d/ai-agents.
 */

import { ApiKeyMap } from "@/app/api/game-models";

export const JEV_API_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
/** Firestore `config/freeTierApiKeys` key name (same convention as the other providers). */
export const JEV_API_KEY_NAME = 'TYPESAFE_API_KEY';
/** $42 per 1B input tokens; output tokens are free. */
export const JEV_INPUT_PRICE_PER_MILLION = 0.042;

export type JevInstructions = string | Record<string, unknown> | unknown[];

export interface JevChoiceQuestion {
    type: 'choice';
    instructions: JevInstructions;
    /** option name → description (or null when the name speaks for itself). Up to 255 options. */
    criteria: Record<string, string | Record<string, unknown> | null>;
}

export interface JevNoulQuestion {
    type: 'noul';
    instructions: JevInstructions;
    criteria?: { true?: string; false?: string };
}

export interface JevScoreQuestion {
    type: 'score';
    instructions: JevInstructions;
    /** Ordered level descriptions, lowest first; at least two. */
    criteria: string[];
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export interface JevChoiceAnswer {
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
}

export interface JevNoulAnswer {
    noul: number;
}

export interface JevScoreAnswer {
    score: number;
    legend: string;
    probabilities: Record<string, number>;
    confidence: number;
}

export type JevAnswerFor<Q extends JevQuestion> =
    Q extends JevChoiceQuestion ? JevChoiceAnswer :
    Q extends JevNoulQuestion ? JevNoulAnswer :
    JevScoreAnswer;

export interface JevResult<Q extends Record<string, JevQuestion>> {
    model: string;
    answers: { [K in keyof Q]: JevAnswerFor<Q[K]> };
    usage: { input_tokens: number; output_tokens: number };
    inputTokens: number;
    costUSD: number;
    durationMs: number;
}

export class JevError extends Error {
    constructor(message: string, public readonly status: number | null, public readonly body?: string) {
        super(message);
        this.name = 'JevError';
    }
}

/**
 * The Jev key comes from the platform key doc like every other provider. In `next dev` only,
 * `TYPESAFE_API_KEY` / `J_K` from the process environment is a fallback so the feature can be
 * tried without touching Firestore (never in production or under Jest, which loads .env too).
 * No key → callers fall back to the LLM Game Master router.
 */
export function getJevApiKey(apiKeys: ApiKeyMap | Record<string, string> | undefined): string | null {
    const fromDoc = apiKeys?.[JEV_API_KEY_NAME];
    if (typeof fromDoc === 'string' && fromDoc.trim()) return fromDoc.trim();
    if (process.env.NODE_ENV === 'development') {
        const fromEnv = process.env[JEV_API_KEY_NAME] || process.env.J_K;
        if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
    }
    return null;
}

export function jevCostUSD(inputTokens: number): number {
    return parseFloat(((inputTokens / 1_000_000) * JEV_INPUT_PRICE_PER_MILLION).toFixed(8));
}

/**
 * One System One call. Every question is evaluated against the same `state` in parallel, so
 * ask everything you might need in a single request (fan-out) and let code pick what matters.
 */
export async function askJev<Q extends Record<string, JevQuestion>>(
    apiKey: string,
    state: JevInstructions,
    questions: Q,
    options: { model?: string; timeoutMs?: number } = {}
): Promise<JevResult<Q>> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let response: Response;
    try {
        response = await fetch(JEV_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, model: options.model ?? JEV_MODEL, questions }),
            signal: controller.signal,
        });
    } catch (error: any) {
        throw new JevError(`Jev request failed: ${error?.message ?? error}`, null);
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
        throw new JevError(`Jev returned HTTP ${response.status}`, response.status, text.slice(0, 500));
    }
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new JevError('Jev returned a non-JSON body', response.status, text.slice(0, 500));
    }
    if (!parsed?.answers || typeof parsed.answers !== 'object') {
        throw new JevError('Jev response has no answers', response.status, text.slice(0, 500));
    }
    const inputTokens = Number(parsed.usage?.input_tokens) || 0;
    return {
        model: parsed.model ?? options.model ?? JEV_MODEL,
        answers: parsed.answers,
        usage: { input_tokens: inputTokens, output_tokens: Number(parsed.usage?.output_tokens) || 0 },
        inputTokens,
        costUSD: jevCostUSD(inputTokens),
        durationMs: Date.now() - started,
    };
}
