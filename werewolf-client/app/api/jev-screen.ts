/**
 * Content screen for human input, backed by Jev (typesafe.ai System One).
 *
 * Every AI call in the game goes out on platform keys, and a provider that keeps seeing
 * content it has labeled prohibited flags the account — the per-game provider block list
 * (app/api/provider-blocks.ts) only stops the second hit. This runs BEFORE the first one:
 * every piece of text a human types — a chat or night message, a new game's setup and its cast
 * as edited before Create, a vote reason, a voice direction — is judged in one ~200 ms call and
 * the verdict is recorded. In `monitor` mode (the default) that is all that happens; in `enforce` mode
 * a would-block verdict rejects the input before it is saved or reaches any provider.
 * The mode is the `jevScreenMode` field of the Firestore doc `config/limits`.
 *
 * Bot output is never screened: refusing a bot turn only creates a stuck game, and the
 * cumulative drift of a permissive model is outside what input screening can fix.
 *
 * Two judges, asked at once: Jev decides, OpenAI Decisions (gpt-6-luna on the platform OpenAI
 * key) decides when Jev errors or times out, and otherwise its answer is recorded alongside as
 * the shadow — paired verdicts to compare the judges on. Decisions takes the same questions and
 * returns Jev-shaped answers, so one verdict rule serves both, though its scores run lower; the
 * hard flags are what blocks. Fails open only when both fail: the input goes through (logged,
 * recorded) — the provider filters stay as the backstop, screening never makes a game stuck.
 *
 * Question wording and levels: app/ai/prompts/jev-screen-prompts.ts. Records: the Firestore
 * collection `jevScreenCalls` (app/api/jev-records.ts), reported by scripts/jev-screen-report.ts.
 */

import { AgentLoggingConfig, ApiKeyMap } from "@/app/api/game-models";
import { askJev, getJevApiKey, JEV_API_KEY_NAME, JEV_MODEL, JevNoulQuestion, JevResult, JevScoreQuestion } from "@/app/ai/jev-client";
import { askOpenAiDecisions, OPENAI_DECISIONS_API_KEY_NAME, OPENAI_DECISIONS_MODEL } from "@/app/ai/openai-decisions-client";
import { recordScreenSpend } from "@/app/api/cost-tracking";
import { getJevScreenMode, JevScreenMode } from "@/app/api/limits-actions";
import { JevScreenShadow, JevScreenSource, JevScreenVerdict, saveJevScreenCall } from "@/app/api/jev-records";
import { logger } from "@/app/utils/logger";
import {
    JEV_SCREEN_CONTEXT_ART_STYLE,
    JEV_SCREEN_CONTEXT_CAST,
    JEV_SCREEN_CONTEXT_CHAT,
    JEV_SCREEN_CONTEXT_NIGHT,
    JEV_SCREEN_CONTEXT_PREVIEW,
    JEV_SCREEN_CONTEXT_VOICE_STYLE,
    JEV_SCREEN_CONTEXT_VOTE,
    JEV_SCREEN_FLAG_QUESTIONS,
    JEV_SCREEN_IMAGE_PERSON_QUESTION,
    JEV_SCREEN_IMAGE_QUESTION,
    JEV_SCREEN_PROMPT_VERSION,
    JEV_SCREEN_RISK_LEVELS,
    JEV_SCREEN_RISK_QUESTION,
    JevScreenFlag,
} from "@/app/ai/prompts/jev-screen-prompts";
import { sanitizeArtStyle } from "@/app/utils/art-style";

export const JEV_SCREEN_CONFIG = {
    /**
     * Would-block comes from these flags alone, each at its own confidence. The 0–3 score never
     * blocks: it is a monitoring signal. 30 days to 2026-10-08: Jev rated 56 of 836 inputs
     * would-block on the score, including explicit sexual roleplay and racial slurs, and the
     * providers refused none of them (0 games with a provider block). The screen exists to predict
     * provider refusals and account flags, so it keeps only what providers act on. `hate` left the
     * list 2026-10-26: its whole record was five n-word messages in one game (2026-09-20) and a
     * self-deprecating "I'm legally retarded" bit, all at 0.90-0.98 on both judges, and every turn
     * went through every provider. The two that stay have no refusal data either; they stay because
     * sexualized minors and threats against real people are what a provider acts on at the ACCOUNT
     * level, where there is no refusal to learn from first. The bar is high on purpose: `minors`
     * leaned to 0.5 on a "loyal boy / puppy" message in the probe. Flags, unlike the score, read
     * alike on Jev and on OpenAI Decisions for blatant content, so one bar serves both judges;
     * Decisions scores ran ~0.5 lower. The other flags, hate included, stay as questions: a grey
     * row carries the strongest one as its reason and the report joins them against refusals.
     * `real_person_sexual` joined 2026-10-30 (Alex): sexualizing a named real person — "Arya Stark
     * from the TV show in a bikini" — is the non-consensual-imagery category providers act on at
     * the account level, like minors, and the story model writes it into the cast on its own
     * when it is in the instructions, so a set-aside of the style would not reach it. A real
     * person in ordinary clothes (`real_person`) is recorded on the row only.
     */
    HARD_FLAGS: { minors: 0.9, real_harm: 0.9, real_person_sexual: 0.9 } as Partial<Record<JevScreenFlag, number>>,
    /**
     * Grey with a reason when the probability mass on the top two risk levels ("likely to be
     * refused" + "must be blocked") reaches this — the rows to read by hand. Was the score block
     * until 2026-10-08.
     */
    HIGH_RISK_PROBABILITY: 0.6,
    /** Grey zone starts here on the 0–3 score: recorded and counted, never rejected. */
    GREY_SCORE: 1.2,
    /**
     * The image question (asked where an art style exists) at or above this sets the art style
     * aside: the game is created and the story untouched, but every image prompt draws from the
     * theme alone. Not a rejection, so it acts in monitor mode too — the mode gates refusing human
     * text, this only steers image prompts away from a call Gemini answers with a 400. The two
     * refused setups of 2026-10-12/13 scored 0.79-0.93 on the text `sexual` flag; the image
     * question is tuned to Gemini's line instead. Live probe 2026-10-13 (Jev, ~150 ms each): the
     * three styles Gemini refused read 0.94 ("nude women, big boobs"), 0.89 ("women in bras …
     * seductive smiles for their prey"), 0.80 ("women in bikinis, big boobs, sexy"); fine styles
     * read 0.18 (1950s pin-up poster girls), 0.14 (gothic romance, sensual atmosphere), 0.15
     * (gore, severed limbs), 0.08 (swimsuits on the beach), 0.09 (ink and watercolor). Reworded
     * 2026-10-30 to nudity and sex only, after Gemini drew a bikini cast with "large boobs" six
     * times (the first wording set it aside as a style, and the player moved the text onto the
     * cast, which nothing screened). The 10-13 "refusals" of clothed styles were thinner than the
     * commit said: one 400 on a reroll of a style that was drawn seven other times that day. Probe
     * on the new wording (Jev, 70-230 ms): nude 0.95, topless 0.98, today's bikini cast 0.10,
     * bikini style 0.17, pin-up 0.23, gore 0.17; the 10-13 probe strings now read 0.21 ("bikinis,
     * big boobs, sexy") and 0.49 ("women in bras … for their prey"), under the bar on purpose: a
     * rare 400 there is a reroll away, a set-aside costs every clothed pin-up. Second probe, the
     * 2026-10-30.2 wording with the real-person rule (Jev, ~100 ms): naked-but-covered 0.98,
     * wet see-through 0.92, lingerie 0.12, backless gown 0.08, the bikini cast 0.12; person rule:
     * "Arya Stark from the TV show in a bikini" 0.89 (and minors 0.91, real_person_sexual 0.95 →
     * would_block), "Maisie Williams in lingerie" 0.98, "the Game of Thrones actresses at a pool
     * party" 0.86 (real_person_sexual only 0.72 — set aside, not blocked), Scarlett Johansson in a
     * gown 0.20 with real_person 0.97 (recorded, nothing set aside), Lara Croft in a bikini 0.37.
     * Near misses to know: "Arya Stark seduces the player" read minors 0.84, under the 0.9 bar.
     * Read the recorded `imageRefusal` against the image refusals in the logs before moving the bar.
     */
    IMAGE_REFUSAL_PROBABILITY: 0.6,
    /**
     * Anything slower than this lets the input through (fail-open). Production Oct 4-7 2026 (189
     * calls): p50 168 ms, p99 314 ms, slowest 343 ms; earlier, previews reached 1.1 s and one
     * timed out at a 1.5 s budget (2026-09-23), and a chat message timed out at 5 s (2026-10-01).
     * 3 s covers the slow previews; past that Jev is stalled, and every human message would wait
     * on it (it was 10 s until 2026-10-07).
     */
    TIMEOUT_MS: 3_000,
    /**
     * OpenAI Decisions, asked only after Jev failed: measured 0.2-0.6 s on full router requests
     * (2026-10-07). With Jev's budget this caps a human message's wait at 6 s when both stall.
     */
    DECISIONS_TIMEOUT_MS: 3_000,
} as const;

export type ScreenQuestions = { risk: JevScoreQuestion; image?: JevNoulQuestion; image_person?: JevNoulQuestion } & Record<JevScreenFlag, JevNoulQuestion>;

export interface ScreenDecision {
    verdict: Exclude<JevScreenVerdict, 'error'>;
    /** On would_block the hard flag that tripped; on a high-risk grey the strongest flag (≥ 0.5) or
     * 'score'; null otherwise. */
    reason: string | null;
    riskScore: number;
    highRisk: number;
    flags: Record<JevScreenFlag, number>;
    /** The image question's probability; null when it was not asked (chat). Outside the verdict:
     * it steers image prompts, it never blocks text. */
    imageRefusal: number | null;
    /** The second picture rule, a real person sexualized; null when not asked. */
    imagePerson: number | null;
}

export interface ScreenInput {
    source: JevScreenSource;
    /** Already clamped by the caller to the input limits. */
    text: string;
    userEmail: string;
    apiKeys: ApiKeyMap | Record<string, string> | undefined;
    gameId?: string;
    day?: number;
}

export interface ScreenOutcome {
    /** 'skipped' when no key is configured or the mode is off — nothing was called or recorded. */
    verdict: JevScreenVerdict | 'skipped';
    reason: string | null;
    mode: JevScreenMode;
    /** True only in enforce mode on a would-block verdict: the caller must not save or send the text. */
    blocked: boolean;
    /** What to show the player when blocked. */
    message?: string;
    /** True when the deciding judge put the image question at or above IMAGE_REFUSAL_PROBABILITY:
     * the caller drops the art style from image prompts. False when not asked, skipped or failed. */
    imageUnsafe: boolean;
}

/** Shown under the art style field when the preview set the style aside. */
export const ART_STYLE_SET_ASIDE_MESSAGE =
    'Your art style was set aside: the image model would refuse to draw it. Portraits and scenes will follow the theme instead.';

/** Better Stack row: verdict/decision and usage only — the screened text, the questions and the
 * raw answers stay out of the logs. The full copy is the Firestore record (jevScreenCalls). */
const JEV_SCREEN_LOG_CONFIG: AgentLoggingConfig = {
    enabled: true,
    logSystemPrompt: false,
    history: { enabled: false, maxCharactersPerMessage: 0 },
    logCommand: false,
    reply: { mode: 'raw', maxReplyChars: -1, maxThinkingChars: 0, includeReasoning: false, includeUsage: true },
};

const SCREEN_AGENT_NAME = 'Content screen';

interface ScreenJudge {
    label: string;
    model: string;
    /** Platform key doc entry this judge bills against. */
    apiKeyName: string;
    timeoutMs: number;
    ask(apiKey: string, state: Record<string, unknown>, questions: ScreenQuestions, options: { timeoutMs: number }): Promise<JevResult<ScreenQuestions>>;
}

const JEV_SCREEN_JUDGE: ScreenJudge = {
    label: 'Jev', model: JEV_MODEL, apiKeyName: JEV_API_KEY_NAME, timeoutMs: JEV_SCREEN_CONFIG.TIMEOUT_MS,
    ask: (apiKey, state, questions, options) => askJev(apiKey, state, questions, options),
};

const DECISIONS_SCREEN_JUDGE: ScreenJudge = {
    label: 'OpenAI Decisions', model: OPENAI_DECISIONS_MODEL, apiKeyName: OPENAI_DECISIONS_API_KEY_NAME,
    timeoutMs: JEV_SCREEN_CONFIG.DECISIONS_TIMEOUT_MS,
    ask: (apiKey, state, questions, options) => askOpenAiDecisions(apiKey, state, questions, options),
};

interface ScreenAttempt {
    judge: ScreenJudge;
    result?: JevResult<ScreenQuestions>;
    error?: string;
    status?: number;
}

/** A judge's answer (or failure) in the record's shadow shape. */
function toShadow(attempt: ScreenAttempt): JevScreenShadow {
    if (!attempt.result) {
        return {
            model: attempt.judge.model, verdict: 'error', reason: null, riskScore: null, highRisk: null, flags: null,
            error: attempt.error, httpStatus: attempt.status,
        };
    }
    const decision = decideScreen(attempt.result.answers);
    return {
        model: attempt.result.model, verdict: decision.verdict, reason: decision.reason,
        riskScore: decision.riskScore, highRisk: decision.highRisk, flags: decision.flags,
        imageRefusal: decision.imageRefusal, imagePerson: decision.imagePerson,
        answers: attempt.result.answers, inputTokens: attempt.result.inputTokens,
        costUSD: attempt.result.costUSD, durationMs: attempt.result.durationMs,
    };
}

/** The judges with a key, in order of precedence: the first that answers decides. */
function screenJudges(apiKeys: ScreenInput['apiKeys']): Array<{ judge: ScreenJudge; apiKey: string }> {
    const judges: Array<{ judge: ScreenJudge; apiKey: string }> = [];
    const jevKey = getJevApiKey(apiKeys);
    if (jevKey) judges.push({ judge: JEV_SCREEN_JUDGE, apiKey: jevKey });
    const openAiKey = (apiKeys as Record<string, string> | undefined)?.[OPENAI_DECISIONS_API_KEY_NAME];
    if (typeof openAiKey === 'string' && openAiKey.trim()) judges.push({ judge: DECISIONS_SCREEN_JUDGE, apiKey: openAiKey.trim() });
    return judges;
}
const FLAG_NAMES = Object.keys(JEV_SCREEN_FLAG_QUESTIONS) as JevScreenFlag[];
const TOP_LEVELS = [JEV_SCREEN_RISK_LEVELS.length - 2, JEV_SCREEN_RISK_LEVELS.length - 1].map(String);

const CONTEXT_BY_SOURCE: Record<JevScreenSource, string> = {
    chat: JEV_SCREEN_CONTEXT_CHAT,
    preview: JEV_SCREEN_CONTEXT_PREVIEW,
    art_style: JEV_SCREEN_CONTEXT_ART_STYLE,
    cast: JEV_SCREEN_CONTEXT_CAST,
    vote: JEV_SCREEN_CONTEXT_VOTE,
    night: JEV_SCREEN_CONTEXT_NIGHT,
    voice_style: JEV_SCREEN_CONTEXT_VOICE_STYLE,
};

/** Sources whose text reaches an image prompt (an art style, the cast's appearances), so the image
 * question is asked alongside. */
const IMAGE_SOURCES: ReadonlySet<JevScreenSource> = new Set(['preview', 'art_style', 'cast']);

/** What a rejection message calls the input. */
const WHAT_BY_SOURCE: Record<JevScreenSource, string> = {
    chat: 'This message',
    preview: 'This game setup',
    art_style: 'This art style',
    cast: 'This cast',
    vote: 'This vote reason',
    night: 'This message',
    voice_style: 'This voice direction',
};

export function buildScreenRequest(source: JevScreenSource, text: string): { state: Record<string, unknown>; questions: ScreenQuestions } {
    const state = { context: CONTEXT_BY_SOURCE[source], text };
    const questions = {
        risk: { type: 'score', instructions: JEV_SCREEN_RISK_QUESTION, criteria: [...JEV_SCREEN_RISK_LEVELS] },
        ...Object.fromEntries(FLAG_NAMES.map(flag => [flag, { type: 'noul', instructions: JEV_SCREEN_FLAG_QUESTIONS[flag] }])),
        ...(IMAGE_SOURCES.has(source) ? {
            image: { type: 'noul', instructions: JEV_SCREEN_IMAGE_QUESTION },
            image_person: { type: 'noul', instructions: JEV_SCREEN_IMAGE_PERSON_QUESTION },
        } : {}),
    } as ScreenQuestions;
    return { state, questions };
}

/** Pure: raw Jev answers + config → verdict. Replayable on recorded rows. */
export function decideScreen(answers: Record<string, any>, config = JEV_SCREEN_CONFIG): ScreenDecision {
    const risk = answers?.risk ?? {};
    const riskScore = Number(risk.score) || 0;
    const highRisk = TOP_LEVELS.reduce((sum, level) => sum + (Number(risk.probabilities?.[level]) || 0), 0);
    const flags = Object.fromEntries(FLAG_NAMES.map(flag => [flag, Number(answers?.[flag]?.noul) || 0])) as Record<JevScreenFlag, number>;
    const imageRefusal = answers?.image?.noul === undefined ? null : (Number(answers.image.noul) || 0);
    const imagePerson = answers?.image_person?.noul === undefined ? null : (Number(answers.image_person.noul) || 0);

    // A hard flag names the reason even when the score agrees, so the message to the player is specific.
    for (const [flag, threshold] of Object.entries(config.HARD_FLAGS) as [JevScreenFlag, number][]) {
        if (flags[flag] >= threshold) {
            return { verdict: 'would_block', reason: flag, riskScore, highRisk, flags, imageRefusal, imagePerson };
        }
    }
    if (highRisk >= config.HIGH_RISK_PROBABILITY) {
        const strongest = FLAG_NAMES.reduce((best, flag) => (flags[flag] > flags[best] ? flag : best), FLAG_NAMES[0]);
        return { verdict: 'grey', reason: flags[strongest] >= 0.5 ? strongest : 'score', riskScore, highRisk, flags, imageRefusal, imagePerson };
    }
    if (riskScore >= config.GREY_SCORE) {
        return { verdict: 'grey', reason: null, riskScore, highRisk, flags, imageRefusal, imagePerson };
    }
    return { verdict: 'ok', reason: null, riskScore, highRisk, flags, imageRefusal, imagePerson };
}

/** Pure: does the decision put the text past either picture rule (nudity, or a sexualized real person)? */
export function isImageUnsafe(decision: { imageRefusal: number | null; imagePerson?: number | null }, config = JEV_SCREEN_CONFIG): boolean {
    const past = (p: number | null | undefined) => p !== null && p !== undefined && p >= config.IMAGE_REFUSAL_PROBABILITY;
    return past(decision.imageRefusal) || past(decision.imagePerson);
}

/** What the player reads when the input is rejected. Names the category, never the score. */
export function screenRejectionMessage(source: JevScreenSource, reason: string | null): string {
    const what = WHAT_BY_SOURCE[source];
    const because: Record<string, string> = {
        sexual: 'it contains sexual content',
        minors: 'it sexualizes a minor',
        hate: 'it contains hate speech',
        real_harm: 'it describes real-world harm',
        real_person_sexual: 'it sexualizes a real person',
        jailbreak: 'it tries to override the AI players\' instructions',
    };
    const why = reason && because[reason] ? ` because ${because[reason]}` : '';
    return `${what} can't be sent to the AI players${why}. Please rephrase it.`;
}

/**
 * Screen one piece of human text. Never throws: every failure path returns `blocked: false`.
 * Skips entirely (no call, no record) without a judge key or when the mode is `off`.
 */
export async function screenHumanInput(input: ScreenInput): Promise<ScreenOutcome> {
    const judges = screenJudges(input.apiKeys);
    if (judges.length === 0) {
        return { verdict: 'skipped', reason: null, mode: 'off', blocked: false, imageUnsafe: false };
    }
    const mode = await getJevScreenMode();
    if (mode === 'off') {
        return { verdict: 'skipped', reason: null, mode, blocked: false, imageUnsafe: false };
    }
    const text = input.text.trim();
    if (!text) {
        return { verdict: 'skipped', reason: null, mode, blocked: false, imageUnsafe: false };
    }

    const { state, questions } = buildScreenRequest(input.source, text);
    const base = {
        gameId: input.gameId ?? null,
        userEmail: input.userEmail,
        source: input.source,
        day: input.day ?? null,
        text,
        state,
        questions,
        promptVersion: JEV_SCREEN_PROMPT_VERSION,
        thresholds: JEV_SCREEN_CONFIG as unknown as Record<string, unknown>,
        mode,
    };

    // Not behind assertFreeSpendWithinLimit: the callers run that guard on the same request
    // (the router right after a chat message, previewGame before this), and the call costs
    // a few thousandths of a cent. It is still billed through recordSpend like everything else.
    // Every judge is asked at once, not in turn: the wait is the slower of the two instead of their
    // sum when Jev fails, and each input gets a paired verdict to compare the judges on (they score
    // the same text very differently, and no refusal data exists yet to say which reads providers
    // better). The first judge that answered decides; the other is recorded as the shadow.
    const attempts: ScreenAttempt[] = await Promise.all(judges.map(async ({ judge, apiKey }) => {
        try {
            return { judge, result: await judge.ask(apiKey, state, questions, { timeoutMs: judge.timeoutMs }) };
        } catch (error: any) {
            // Both judge clients throw errors carrying the HTTP status and a body excerpt.
            const status: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
            return { judge, error: `${error?.message ?? error}${error?.body ? `: ${error.body}` : ''}`, status };
        }
    }));
    const deciding = attempts.find(attempt => attempt.result);
    const shadowAttempt = attempts.find(attempt => attempt !== (deciding ?? attempts[0]));

    for (const attempt of attempts) {
        if (attempt.result) {
            await recordScreenSpend(
                input.gameId,
                { inputTokens: attempt.result.inputTokens, outputTokens: 0, costUSD: attempt.result.costUSD, durationMs: attempt.result.durationMs },
                input.userEmail,
                attempt.result.model,
                attempt.judge.apiKeyName
            );
            continue;
        }
        const fallback = deciding ? `${deciding.judge.label} decided` : 'let through';
        console.error(`🛡️ ${attempt.judge.label} screen failed (${input.source}, ${fallback}): ${attempt.error}`);
        // `warn` for the backup judge when the primary decided (its answer is only the shadow);
        // `error` when the primary failed (Decisions deciding is the fallback) or nothing decided.
        const shadowOnly = deciding === attempts[0] && attempt !== attempts[0];
        logger[shadowOnly ? 'warn' : 'error'](`${attempt.judge.label} screen request failed${shadowOnly ? ' (shadow)' : ''}`, {
            gameId: input.gameId, userId: input.userEmail, agentName: SCREEN_AGENT_NAME, activity: 'jev_screen',
            source: input.source, model: attempt.judge.model, error: attempt.error, status: attempt.status, fallback,
        });
    }
    const shadow = shadowAttempt ? toShadow(shadowAttempt) : undefined;

    if (!deciding?.result) {
        const failed = attempts[0];
        await saveJevScreenCall({
            ...base, model: failed.judge.model, verdict: 'error', reason: null, riskScore: null, highRisk: null, flags: null,
            enforced: false, error: failed.error, httpStatus: failed.status, shadow,
        });
        return { verdict: 'error', reason: null, mode, blocked: false, imageUnsafe: false };
    }
    const { judge, result } = deciding;

    const decision = decideScreen(result.answers);
    const blocked = mode === 'enforce' && decision.verdict === 'would_block';
    const imageUnsafe = isImageUnsafe(decision);
    const setAside = !imageUnsafe ? '' : input.source === 'cast' ? ' (appearances set aside)' : ' (art style set aside)';
    const summary = `${decision.verdict}${decision.reason ? ` (${decision.reason})` : ''} score=${decision.riskScore.toFixed(2)} high=${decision.highRisk.toFixed(2)} ` +
        FLAG_NAMES.map(flag => `${flag}=${decision.flags[flag].toFixed(2)}`).join(' ') +
        (decision.imageRefusal === null ? '' : ` image=${decision.imageRefusal.toFixed(2)} person=${(decision.imagePerson ?? 0).toFixed(2)}${setAside}`);
    const shadowSummary = shadow ? `; ${shadowAttempt!.judge.label} ${shadow.verdict}${shadow.riskScore !== null ? ` score=${shadow.riskScore.toFixed(2)}` : ''}` : '';
    console.log(`🛡️ ${judge.label} screen [${mode}] ${input.source}: ${summary} — ${result.durationMs} ms, ${result.inputTokens} tokens${blocked ? ' → REJECTED' : ''}${shadowSummary}`);

    await saveJevScreenCall({
        ...base, model: result.model, answers: result.answers,
        inputTokens: result.inputTokens, costUSD: result.costUSD, durationMs: result.durationMs,
        verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        flags: decision.flags, imageRefusal: decision.imageRefusal, imagePerson: decision.imagePerson, enforced: blocked, shadow,
    });

    const logLevel = decision.verdict === 'would_block' || imageUnsafe ? 'warn' : 'info';
    logger[logLevel](`Jev screen ${decision.verdict}${blocked ? ' (rejected)' : ''}${setAside}`, {
        gameId: input.gameId, userId: input.userEmail, activity: 'jev_screen', source: input.source, mode,
        model: result.model, verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        imageRefusal: decision.imageRefusal, imagePerson: decision.imagePerson, imageUnsafe, durationMs: result.durationMs,
    });
    logger.agentActivity(SCREEN_AGENT_NAME, result.model, 'jev_screen', {
        gameId: input.gameId,
        userId: input.userEmail,
        reply: { decision, mode, enforced: blocked },
        usage: {
            inputTokens: result.inputTokens,
            outputTokens: 0,
            totalTokens: result.inputTokens,
            costUSD: result.costUSD,
            durationMs: result.durationMs,
        },
    }, JEV_SCREEN_LOG_CONFIG);

    return {
        verdict: decision.verdict,
        reason: decision.reason,
        mode,
        blocked,
        ...(blocked ? { message: screenRejectionMessage(input.source, decision.reason) } : {}),
        imageUnsafe,
    };
}

/**
 * Screens an art style on its own, where one enters an image prompt after the preview already
 * judged the setup: game creation and the paid draft illustrations both take the field as the
 * player last typed it, which may not be what the preview saw. Returns `unsafe: false` without
 * a call when there is no style, and (like every screen) on a skipped or failed call.
 */
export async function screenArtStyle(input: { theme: string; artStyle: string | undefined; userEmail: string; apiKeys: ScreenInput['apiKeys']; gameId?: string }): Promise<{ unsafe: boolean }> {
    const artStyle = sanitizeArtStyle(input.artStyle);
    if (!artStyle) return { unsafe: false };
    const outcome = await screenHumanInput({
        source: 'art_style',
        text: `Theme: ${input.theme.trim()}\nArt style: ${artStyle}`,
        userEmail: input.userEmail,
        apiKeys: input.apiKeys,
        gameId: input.gameId,
    });
    return { unsafe: outcome.imageUnsafe };
}

/**
 * Screens the cast as the player submits it to createGame. Every field here is editable on the
 * preview page after the preview was judged, and the appearances go verbatim into the portrait
 * prompts: on 2026-10-30 a player whose art style had been set aside put the same text on every
 * character's appearance instead, and nothing looked at it. One call over the whole cast (the
 * backstories are mostly model-written, which is fine — the judge reads for what a provider would
 * refuse, not for authorship). The image question is asked, so a cast past the bar has its
 * appearances set aside by the caller, the way an art style is; the portraits then follow the
 * backstories. Empty-cast calls are skipped like any empty text.
 */
export async function screenCast(input: {
    scene: string;
    gameMasterVoiceStyle?: string;
    bots: { name: string; story: string; visualDescription?: string; voiceStyle?: string }[];
    userEmail: string;
    apiKeys: ScreenInput['apiKeys'];
}): Promise<ScreenOutcome> {
    const gmVoice = input.gameMasterVoiceStyle?.trim();
    const blocks = [
        `Opening story: ${input.scene.trim()}`,
        ...(gmVoice ? [`Game Master voice: ${gmVoice}`] : []),
        ...input.bots.map(bot => [
            `Character ${bot.name.trim()}`,
            `Backstory: ${bot.story.trim()}`,
            ...(bot.visualDescription?.trim() ? [`Appearance: ${bot.visualDescription.trim()}`] : []),
            ...(bot.voiceStyle?.trim() ? [`Voice: ${bot.voiceStyle.trim()}`] : []),
        ].join('\n')),
    ];
    return screenHumanInput({ source: 'cast', text: blocks.join('\n\n'), userEmail: input.userEmail, apiKeys: input.apiKeys });
}
