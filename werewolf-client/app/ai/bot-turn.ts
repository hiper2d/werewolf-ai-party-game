/**
 * ONE answer schema for every bot turn.
 *
 * Why: on the providers that enforce a JSON schema, the prompt cache is keyed on the output
 * format. A plain-text discussion reply followed by a schema vote (and four different night
 * schemas) threw the cached day away at every switch — measured 2026-11-12: 0% of the
 * vote's input read from cache on OpenAI, Mistral and Gemini, 77-90% with one schema on both
 * calls (scripts/probe-unified-schema.ts). So every turn sends the SAME four nullable
 * fields with generic descriptions, the unsaved turn tail says which ones this turn needs
 * (botAnswerFormatLine), and code validates them. Never add a per-turn or per-role schema,
 * a per-turn enum, or a turn-specific description here: any difference is a cache miss.
 *
 * Scope: providers that enforce schemas (enforcesSchema in the library) use it for every
 * turn. The others (DeepSeek, MiniMax, Grok, GLM, Fugu, Meta) keep plain text for text
 * turns — they do not lose the cache on a format switch, and without enforcement a long
 * reply inside JSON is the malformed-answer risk we left behind — and get the same schema,
 * described in the prompt by their agents, for turns that need a choice.
 */
import { z } from 'zod';
import { AbstractAgent, AIMessage, enforcesSchema, TokenUsage } from '@hiper2d/ai-agents';
import { resolveModelId } from '@/app/ai/ai-models';
import { BotResponseError } from '@/app/api/game-models';
import { invalidActionExplanation } from '@/app/api/retry-hint';
import { unwrapJsonReply } from '@/app/utils/text-format';

export const BotTurnZodSchema = z.object({
    comment: z.string().nullable().describe('Your text reply, when the command asks for one. Otherwise null.'),
    target: z.string().nullable().describe('One exact player name, when the command asks you to choose a player. Otherwise null.'),
    action: z.string().nullable().describe('The action to apply to the target, when the command asks you to pick an action. Otherwise null.'),
    story: z.string().nullable().describe('One short in-world sentence of mood and imagery, when the command invites one. Otherwise null.'),
});

export interface BotTurnAnswer {
    comment: string | null;
    target: string | null;
    action: string | null;
    story: string | null;
}

type AskResult<T> = [T, string, TokenUsage | undefined, string | undefined];

/** Whether this model answers EVERY turn through the shared schema (see the file comment). */
export function usesSharedSchema(aiType: string): boolean {
    return enforcesSchema(resolveModelId(aiType));
}

/** Models fill unused fields with "", "null" or "none" as often as with null. */
function cleanField(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return !trimmed || /^(null|none|n\/a)$/i.test(trimmed) ? null : trimmed;
}

function cleanAnswer(raw: any): BotTurnAnswer {
    return {
        comment: cleanField(raw?.comment),
        target: cleanField(raw?.target),
        action: cleanField(raw?.action),
        story: cleanField(raw?.story),
    };
}

/**
 * A turn whose answer is text only (intro, discussion, post-game chat, the werewolves'
 * night chat, end-of-day notes). Returns the text, or null when the model gave none.
 * Fields the turn did not ask for are ignored: Mistral fills `target`/`action` on
 * discussion turns even when told to leave them null.
 */
export async function askBotText(agent: AbstractAgent, history: AIMessage[], aiType: string): Promise<AskResult<string | null>> {
    if (usesSharedSchema(aiType)) {
        const [raw, thinking, usage, signature] = await agent.askWithZodSchema(BotTurnZodSchema, history);
        return [cleanAnswer(raw).comment, thinking, usage, signature];
    }
    const [text, thinking, usage, signature] = await agent.askText(history);
    return [text ? unwrapJsonReply(text) : null, thinking, usage, signature];
}

/** A turn that needs a choice (vote, night action): the shared schema on every provider. */
export async function askBotChoice(agent: AbstractAgent, history: AIMessage[]): Promise<AskResult<BotTurnAnswer | null>> {
    const [raw, thinking, usage, signature] = await agent.askWithZodSchema(BotTurnZodSchema, history);
    return [raw ? cleanAnswer(raw) : null, thinking, usage, signature];
}

/**
 * The `action` of a night answer, checked against what the command offered. Missing means
 * the role's normal action. An answer that names exactly one allowed action is read as it
 * ("Kill.", "kill Oren"); naming none or several is a rejected answer (surfaced like a
 * wrong target: the user's Retry carries the explanation back to the model).
 */
export function resolveBotAction<T extends string>(answer: BotTurnAnswer, allowed: readonly T[], fallback: T, botName: string): T {
    if (answer.action === null) return fallback;
    const words = answer.action.toLowerCase().split(/[^a-z_]+/);
    const named = allowed.filter(a => words.includes(a));
    if (named.length === 1) return named[0];
    throw new BotResponseError(
        `Invalid action: ${answer.action}`,
        `${botName} answered with the action "${answer.action}". Allowed: ${allowed.join(', ')}`,
        { botName, selectedAction: answer.action, allowedActions: [...allowed] },
        true,
        invalidActionExplanation(answer.action, [...allowed])
    );
}

/** What a turn asks the bot to put in the shared fields. */
export type BotAnswerKind = 'reply' | 'notes' | 'vote' | 'night';

const JSON_HEAD = '**ANSWER FORMAT:** a JSON object with exactly four fields: `comment`, `target`, `action`, `story`. ';
const JSON_FIELDS: Record<BotAnswerKind, string> = {
    reply: 'Put your reply in `comment` as plain prose (no quotation marks around it, no JSON inside it). Set `target`, `action` and `story` to null.',
    notes: 'Put your notes in `comment` as plain prose. Set `target`, `action` and `story` to null.',
    vote: 'Put the ONE name you vote for in `target`, copied exactly from the candidate list, and your brief reason in `comment`. Set `action` and `story` to null.',
    night: 'Put the ONE name you choose in `target`, copied exactly from the list of targets, and your private reasoning in `comment`. `action`: one of the actions the command lists, or null when it lists none or you take the default. `story`: the optional one-sentence hint the command describes, or null.',
};

/**
 * The last line of a turn tail: how to answer THIS turn. It lives in the unsaved tail, not
 * in the saved GM command, because it differs by provider (schema or plain text) and a game
 * can switch a bot's model mid-day.
 */
export function botAnswerFormatLine(aiType: string, kind: BotAnswerKind): string {
    if (kind === 'vote' || kind === 'night' || usesSharedSchema(aiType)) {
        return JSON_HEAD + JSON_FIELDS[kind];
    }
    return kind === 'notes'
        ? ''
        : '**ANSWER FORMAT:** plain prose only: your words, NOT wrapped in quotation marks, no JSON.';
}
