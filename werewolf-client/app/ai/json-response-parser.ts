import { z } from 'zod';
import { cleanResponse } from '@/app/utils/message-utils';
import { safeValidateResponse } from '@/app/ai/prompts/zod-schemas';

/**
 * Extract the first balanced JSON object embedded in `text`.
 * String- and escape-aware, so braces inside string values don't break the scan.
 * If the first candidate fails to parse, scanning continues from the next '{'.
 * Returns null when no parseable object is found.
 */
export function extractFirstJsonObject(text: string): unknown | null {
    let searchFrom = 0;
    while (true) {
        const start = text.indexOf('{', searchFrom);
        if (start < 0) return null;

        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        return JSON.parse(text.slice(start, i + 1));
                    } catch {
                        break; // unbalanced-looking but unparseable — try the next '{'
                    }
                }
            }
        }
        searchFrom = start + 1;
    }
}

/**
 * Models sometimes return `{ reply: { ... } }` when the schema expects
 * `{ reply: "..." }` (seen with Mistral on prompts with structured sections).
 * Flatten the nested object into a string so validation can succeed.
 */
function normalizeNestedReply(value: unknown, log: (message: string) => void): unknown {
    if (value && typeof value === 'object' && 'reply' in value) {
        const reply = (value as Record<string, unknown>).reply;
        if (reply && typeof reply === 'object') {
            log('Converting nested reply object to string');
            return { ...(value as Record<string, unknown>), reply: JSON.stringify(reply, null, 2) };
        }
    }
    return value;
}

/**
 * Lenient parse + Zod validation of an LLM text reply, shared by all agents.
 *
 * Order of attempts:
 * 1. Strict JSON parse of the fence-stripped reply (plus a quote-unwrapped
 *    variant for Gemini's quoted-JSON-string quirk).
 * 2. Extraction of the first balanced JSON object embedded in prose
 *    (rescues "Sure, here is my answer: {...}" replies).
 * 3. Wrapping raw prose as `{ reply: ... }` for BotAnswer-shaped schemas
 *    (rescues bots that "speak in character" instead of returning JSON).
 *
 * Throws with the same message prefixes the agents have always used
 * ("Failed to parse JSON response:", "Response validation failed:") so log
 * queries and error handling stay stable.
 */
export function parseAndValidateLlmJson<T>(
    rawReply: string,
    zodSchema: z.ZodSchema<T>,
    log: (message: string) => void = () => {}
): T {
    const cleaned = cleanResponse(rawReply);

    const candidates: string[] = [cleaned];
    // Gemini sometimes returns the JSON string wrapped in quotes
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        candidates.push(cleaned.slice(1, -1).replace(/\\"/g, '"'));
    }

    let parseError: unknown = null;
    let zodError: z.ZodError | null = null;

    const tryValidate = (value: unknown): { data: T } | null => {
        const result = safeValidateResponse(zodSchema, normalizeNestedReply(value, log));
        if (result.success) return { data: result.data };
        zodError = zodError ?? result.error;
        return null;
    };

    // 1. Strict parse
    for (const candidate of candidates) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(candidate);
        } catch (error) {
            parseError = parseError ?? error;
            continue;
        }
        const validated = tryValidate(parsed);
        if (validated) return validated.data;
    }

    // 2. First balanced JSON object embedded in prose
    for (const candidate of candidates) {
        const extracted = extractFirstJsonObject(candidate);
        if (extracted === null) continue;
        const validated = tryValidate(extracted);
        if (validated) {
            log(`Recovered JSON embedded in prose response (${candidate.length} chars)`);
            return validated.data;
        }
    }

    // 3. Last resort: accept prose for BotAnswer-shaped schemas
    const wrapped = safeValidateResponse(zodSchema, { reply: cleaned });
    if (wrapped.success) {
        log(`Wrapped prose response as reply (${cleaned.length} chars)`);
        return wrapped.data;
    }

    if (zodError !== null) {
        log(`Zod validation failed: ${JSON.stringify((zodError as z.ZodError).errors)}`);
        throw new Error(`Response validation failed: ${(zodError as z.ZodError).message}`);
    }
    throw new Error(`Failed to parse JSON response: ${parseError}. First 200 chars: ${cleaned.slice(0, 200)}`);
}
