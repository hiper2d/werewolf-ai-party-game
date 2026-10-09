/**
 * Content screen for human input, backed by Jev (typesafe.ai System One).
 *
 * Every AI call in the game goes out on platform keys, and a provider that keeps seeing
 * content it has labeled prohibited flags the account — the per-game provider block list
 * (app/api/provider-blocks.ts) only stops the second hit. This runs BEFORE the first one:
 * a human chat message or a new game's setup is judged in one ~200 ms call and the verdict
 * is recorded. In `monitor` mode (the default) that is all that happens; in `enforce` mode
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
    JEV_SCREEN_CONTEXT_CHAT,
    JEV_SCREEN_CONTEXT_PREVIEW,
    JEV_SCREEN_FLAG_QUESTIONS,
    JEV_SCREEN_PROMPT_VERSION,
    JEV_SCREEN_RISK_LEVELS,
    JEV_SCREEN_RISK_QUESTION,
    JevScreenFlag,
} from "@/app/ai/prompts/jev-screen-prompts";

export const JEV_SCREEN_CONFIG = {
    /**
     * Would-block comes from these flags alone, each at its own confidence. The 0–3 score never
     * blocks: it is a monitoring signal. 30 days to 2026-10-08: Jev rated 56 of 836 inputs
     * would-block on the score, including explicit sexual roleplay and racial slurs, and the
     * providers refused none of them (0 games with a provider block). The screen exists to predict
     * provider refusals and account flags, so it keeps only the categories providers never
     * tolerate. The bar is high on purpose: `minors` leaned to 0.5 on a "loyal boy / puppy"
     * message in the probe. Flags, unlike the score, read alike on Jev and on OpenAI Decisions
     * for blatant content, so one bar serves both judges; Decisions scores ran ~0.5 lower.
     */
    HARD_FLAGS: { minors: 0.9, real_harm: 0.9, hate: 0.9 } as Partial<Record<JevScreenFlag, number>>,
    /**
     * Grey with a reason when the probability mass on the top two risk levels ("likely to be
     * refused" + "must be blocked") reaches this — the rows to read by hand. Was the score block
     * until 2026-10-08.
     */
    HIGH_RISK_PROBABILITY: 0.6,
    /** Grey zone starts here on the 0–3 score: recorded and counted, never rejected. */
    GREY_SCORE: 1.2,
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

export type ScreenQuestions = { risk: JevScoreQuestion } & Record<JevScreenFlag, JevNoulQuestion>;

export interface ScreenDecision {
    verdict: Exclude<JevScreenVerdict, 'error'>;
    /** On would_block the hard flag that tripped; on a high-risk grey the strongest flag (≥ 0.5) or
     * 'score'; null otherwise. */
    reason: string | null;
    riskScore: number;
    highRisk: number;
    flags: Record<JevScreenFlag, number>;
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
}

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

export function buildScreenRequest(source: JevScreenSource, text: string): { state: Record<string, unknown>; questions: ScreenQuestions } {
    const state = {
        context: source === 'chat' ? JEV_SCREEN_CONTEXT_CHAT : JEV_SCREEN_CONTEXT_PREVIEW,
        text,
    };
    const questions = {
        risk: { type: 'score', instructions: JEV_SCREEN_RISK_QUESTION, criteria: [...JEV_SCREEN_RISK_LEVELS] },
        ...Object.fromEntries(FLAG_NAMES.map(flag => [flag, { type: 'noul', instructions: JEV_SCREEN_FLAG_QUESTIONS[flag] }])),
    } as ScreenQuestions;
    return { state, questions };
}

/** Pure: raw Jev answers + config → verdict. Replayable on recorded rows. */
export function decideScreen(answers: Record<string, any>, config = JEV_SCREEN_CONFIG): ScreenDecision {
    const risk = answers?.risk ?? {};
    const riskScore = Number(risk.score) || 0;
    const highRisk = TOP_LEVELS.reduce((sum, level) => sum + (Number(risk.probabilities?.[level]) || 0), 0);
    const flags = Object.fromEntries(FLAG_NAMES.map(flag => [flag, Number(answers?.[flag]?.noul) || 0])) as Record<JevScreenFlag, number>;

    // A hard flag names the reason even when the score agrees, so the message to the player is specific.
    for (const [flag, threshold] of Object.entries(config.HARD_FLAGS) as [JevScreenFlag, number][]) {
        if (flags[flag] >= threshold) {
            return { verdict: 'would_block', reason: flag, riskScore, highRisk, flags };
        }
    }
    if (highRisk >= config.HIGH_RISK_PROBABILITY) {
        const strongest = FLAG_NAMES.reduce((best, flag) => (flags[flag] > flags[best] ? flag : best), FLAG_NAMES[0]);
        return { verdict: 'grey', reason: flags[strongest] >= 0.5 ? strongest : 'score', riskScore, highRisk, flags };
    }
    if (riskScore >= config.GREY_SCORE) {
        return { verdict: 'grey', reason: null, riskScore, highRisk, flags };
    }
    return { verdict: 'ok', reason: null, riskScore, highRisk, flags };
}

/** What the player reads when the input is rejected. Names the category, never the score. */
export function screenRejectionMessage(source: JevScreenSource, reason: string | null): string {
    const what = source === 'chat' ? 'This message' : 'This game setup';
    const because: Record<string, string> = {
        sexual: 'it contains sexual content',
        minors: 'it sexualizes a minor',
        hate: 'it contains hate speech',
        real_harm: 'it describes real-world harm',
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
        return { verdict: 'skipped', reason: null, mode: 'off', blocked: false };
    }
    const mode = await getJevScreenMode();
    if (mode === 'off') {
        return { verdict: 'skipped', reason: null, mode, blocked: false };
    }
    const text = input.text.trim();
    if (!text) {
        return { verdict: 'skipped', reason: null, mode, blocked: false };
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
        logger.error(`${attempt.judge.label} screen request failed`, {
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
        return { verdict: 'error', reason: null, mode, blocked: false };
    }
    const { judge, result } = deciding;

    const decision = decideScreen(result.answers);
    const blocked = mode === 'enforce' && decision.verdict === 'would_block';
    const summary = `${decision.verdict}${decision.reason ? ` (${decision.reason})` : ''} score=${decision.riskScore.toFixed(2)} high=${decision.highRisk.toFixed(2)} ` +
        FLAG_NAMES.map(flag => `${flag}=${decision.flags[flag].toFixed(2)}`).join(' ');
    const shadowSummary = shadow ? `; ${shadowAttempt!.judge.label} ${shadow.verdict}${shadow.riskScore !== null ? ` score=${shadow.riskScore.toFixed(2)}` : ''}` : '';
    console.log(`🛡️ ${judge.label} screen [${mode}] ${input.source}: ${summary} — ${result.durationMs} ms, ${result.inputTokens} tokens${blocked ? ' → REJECTED' : ''}${shadowSummary}`);

    await saveJevScreenCall({
        ...base, model: result.model, answers: result.answers,
        inputTokens: result.inputTokens, costUSD: result.costUSD, durationMs: result.durationMs,
        verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        flags: decision.flags, enforced: blocked, shadow,
    });

    const logLevel = decision.verdict === 'would_block' ? 'warn' : 'info';
    logger[logLevel](`Jev screen ${decision.verdict}${blocked ? ' (rejected)' : ''}`, {
        gameId: input.gameId, userId: input.userEmail, activity: 'jev_screen', source: input.source, mode,
        model: result.model, verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        durationMs: result.durationMs,
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
    };
}
