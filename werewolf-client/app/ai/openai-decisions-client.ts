/**
 * Minimal client for OpenAI's Decisions API (POST /v1/decisions, public beta since 2026-10-06).
 *
 * Same kind of model as Jev: a judge that reads shared evidence plus named questions and returns
 * calibrated answers for all of them in one call, with no text generation (input tokens only).
 * Its three question types map one to one onto Jev's — predicate ↔ noul, choice ↔ choice,
 * score ↔ score — so this client takes Jev-shaped questions and returns Jev-shaped answers,
 * letting the speaker router run on either judge unchanged. Docs:
 * https://developers.openai.com/api/docs/guides/decisions
 *
 * Plain fetch, like jev-client: the app's openai SDK (5.x) predates `client.decisions`.
 * Measured 2026-10-07 from a laptop: three router-style questions in 0.56s, 459 input tokens.
 */

import type { JevInstructions, JevQuestion, JevResult } from '@/app/ai/jev-client';

export const OPENAI_DECISIONS_API_URL = 'https://api.openai.com/v1/decisions';
/** The only model the endpoint accepts during the beta. */
export const OPENAI_DECISIONS_MODEL = 'gpt-6-luna';
/** Platform key doc entry — the same OpenAI key the GPT bots use. */
export const OPENAI_DECISIONS_API_KEY_NAME = 'OPENAI_API_KEY';
/** $0.10 per 1M input tokens; no output, cache-read or cache-write charges. */
export const OPENAI_DECISIONS_INPUT_PRICE_PER_MILLION = 0.10;

export class OpenAiDecisionsError extends Error {
    constructor(message: string, public readonly status: number | null, public readonly body?: string) {
        super(message);
        this.name = 'OpenAiDecisionsError';
    }
}

export function openAiDecisionsCostUSD(inputTokens: number): number {
    return parseFloat(((inputTokens / 1_000_000) * OPENAI_DECISIONS_INPUT_PRICE_PER_MILLION).toFixed(8));
}

const asText = (value: JevInstructions | Record<string, unknown>): string =>
    typeof value === 'string' ? value : JSON.stringify(value);

/** Jev question → Decisions question. Jev's `criteria` become choices / levels / predicate wording. */
function toDecisionsQuestion(name: string, question: JevQuestion): Record<string, unknown> {
    const instructions = asText(question.instructions);
    if (question.type === 'noul') {
        const { true: whenTrue, false: whenFalse } = question.criteria ?? {};
        const clarifications = [
            whenTrue ? `True means: ${whenTrue}` : '',
            whenFalse ? `False means: ${whenFalse}` : '',
        ].filter(Boolean).join('\n');
        return { type: 'predicate', name, instructions: clarifications ? `${instructions}\n${clarifications}` : instructions };
    }
    if (question.type === 'choice') {
        return {
            type: 'choice',
            name,
            instructions,
            choices: Object.entries(question.criteria).map(([value, description]) =>
                description == null ? { value } : { value, description: asText(description) }),
        };
    }
    // Jev score levels are descriptions only; Decisions wants a label per level, so the index is
    // the label and the Jev text is its description.
    return {
        type: 'score',
        name,
        instructions,
        levels: question.criteria.map((description, index) => ({ label: String(index), description })),
    };
}

/** Decisions answer → the Jev answer shape the router reads (probabilities keyed by value / level index). */
function toJevAnswer(answer: any): unknown {
    if (answer.type === 'predicate') {
        return { noul: Number(answer.probability) || 0 };
    }
    if (answer.type === 'choice') {
        return {
            choice: String(answer.choice),
            probabilities: Object.fromEntries((answer.probabilities ?? []).map((p: any) => [String(p.value), Number(p.probability) || 0])),
            confidence: Number(answer.confidence) || 0,
        };
    }
    // score
    const levels: any[] = answer.probabilities ?? [];
    const nearest = levels.reduce((best, p) => (best && best.probability >= p.probability ? best : p), null as any);
    return {
        score: Number(answer.score) || 0,
        legend: nearest?.label ?? '',
        probabilities: Object.fromEntries(levels.map(p => [String(p.value), Number(p.probability) || 0])),
        confidence: Number(answer.confidence) || 0,
    };
}

/**
 * One Decisions call with Jev-shaped input and output. `state` is sent as the shared text input
 * (JSON-encoded when it is an object). A `refusal` answer for any question fails the whole call:
 * the router has no use for a partial set of answers.
 */
export async function askOpenAiDecisions<Q extends Record<string, JevQuestion>>(
    apiKey: string,
    state: JevInstructions,
    questions: Q,
    options: { timeoutMs?: number } = {}
): Promise<JevResult<Q>> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let response: Response;
    try {
        response = await fetch(OPENAI_DECISIONS_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OPENAI_DECISIONS_MODEL,
                input: asText(state),
                questions: Object.entries(questions).map(([name, question]) => toDecisionsQuestion(name, question)),
            }),
            signal: controller.signal,
        });
    } catch (error: any) {
        const elapsed = Date.now() - started;
        if (controller.signal.aborted) {
            throw new OpenAiDecisionsError(`OpenAI Decisions request timed out after ${elapsed} ms`, null);
        }
        throw new OpenAiDecisionsError(`OpenAI Decisions request failed after ${elapsed} ms: ${error?.message ?? error}`, null);
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
        throw new OpenAiDecisionsError(`OpenAI Decisions returned HTTP ${response.status}`, response.status, text.slice(0, 500));
    }
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new OpenAiDecisionsError('OpenAI Decisions returned a non-JSON body', response.status, text.slice(0, 500));
    }
    if (!Array.isArray(parsed?.answers)) {
        throw new OpenAiDecisionsError('OpenAI Decisions response has no answers', response.status, text.slice(0, 500));
    }
    const refused = parsed.answers.filter((a: any) => a?.type === 'refusal').map((a: any) => a.name);
    if (refused.length > 0) {
        throw new OpenAiDecisionsError(`OpenAI Decisions refused: ${refused.join(', ')}`, response.status, text.slice(0, 500));
    }
    const answers = Object.fromEntries(parsed.answers.map((a: any) => [a.name, toJevAnswer(a)]));
    const missing = Object.keys(questions).filter(name => !(name in answers));
    if (missing.length > 0) {
        throw new OpenAiDecisionsError(`OpenAI Decisions response is missing answers: ${missing.join(', ')}`, response.status, text.slice(0, 500));
    }
    const inputTokens = Number(parsed.usage?.input_tokens) || 0;
    return {
        model: parsed.model ?? OPENAI_DECISIONS_MODEL,
        answers: answers as JevResult<Q>['answers'],
        usage: { input_tokens: inputTokens, output_tokens: 0 },
        inputTokens,
        costUSD: openAiDecisionsCostUSD(inputTokens),
        durationMs: Date.now() - started,
    };
}
