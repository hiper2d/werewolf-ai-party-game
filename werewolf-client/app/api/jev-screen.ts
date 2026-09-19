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
 * Fails open: a Jev error or timeout lets the input through (logged, recorded) — the
 * provider filters stay as the backstop, screening never makes a game stuck.
 *
 * Question wording and levels: app/ai/prompts/jev-screen-prompts.ts. Records: the Firestore
 * collection `jevScreenCalls` (app/api/jev-records.ts), reported by scripts/jev-screen-report.ts.
 */

import { AgentLoggingConfig, ApiKeyMap, MESSAGE_ROLE } from "@/app/api/game-models";
import { askJev, getJevApiKey, JEV_API_KEY_NAME, JEV_MODEL, JevError, JevNoulQuestion, JevScoreQuestion } from "@/app/ai/jev-client";
import { recordScreenSpend } from "@/app/api/cost-tracking";
import { getJevScreenMode, JevScreenMode } from "@/app/api/limits-actions";
import { JevScreenSource, JevScreenVerdict, saveJevScreenCall } from "@/app/api/jev-records";
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
     * Would-block when the probability mass on the top two risk levels ("likely to be refused"
     * + "must be blocked") reaches this. The probe put every prohibited sample at ≥ 0.9 here and
     * every game-talk sample at ≤ 0.05.
     */
    BLOCK_HIGH_RISK_PROBABILITY: 0.6,
    /**
     * Would-block when one of these flags alone is this confident, whatever the score says. High
     * on purpose: `minors` leaned to 0.5 on a "loyal boy / puppy" message in the probe.
     */
    HARD_FLAGS: { minors: 0.9, real_harm: 0.9, hate: 0.9 } as Partial<Record<JevScreenFlag, number>>,
    /** Grey zone starts here on the 0–3 score: recorded and counted, never rejected. */
    GREY_SCORE: 1.2,
    /** Jev answered the probe in ~200 ms; anything slower than this lets the input through. */
    TIMEOUT_MS: 1500,
} as const;

export type ScreenQuestions = { risk: JevScoreQuestion } & Record<JevScreenFlag, JevNoulQuestion>;

export interface ScreenDecision {
    verdict: Exclude<JevScreenVerdict, 'error'>;
    /** The flag that tripped, or 'score' when the risk levels did, or null when ok / grey. */
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

/** Full row to Better Stack, nothing truncated: the text is short by construction (input limits). */
const JEV_SCREEN_LOG_CONFIG: AgentLoggingConfig = {
    enabled: true,
    logSystemPrompt: false,
    history: { enabled: true, maxCharactersPerMessage: -1 },
    logCommand: true,
    reply: { mode: 'raw', maxReplyChars: -1, maxThinkingChars: 0, includeReasoning: false, includeUsage: true },
};

const SCREEN_AGENT_NAME = 'Content screen';
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
    if (highRisk >= config.BLOCK_HIGH_RISK_PROBABILITY) {
        const strongest = FLAG_NAMES.reduce((best, flag) => (flags[flag] > flags[best] ? flag : best), FLAG_NAMES[0]);
        return { verdict: 'would_block', reason: flags[strongest] >= 0.5 ? strongest : 'score', riskScore, highRisk, flags };
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
 * Skips entirely (no call, no record) without a Jev key or when the mode is `off`.
 */
export async function screenHumanInput(input: ScreenInput): Promise<ScreenOutcome> {
    const apiKey = getJevApiKey(input.apiKeys);
    if (!apiKey) {
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
    let result;
    try {
        result = await askJev(apiKey, state, questions, { timeoutMs: JEV_SCREEN_CONFIG.TIMEOUT_MS });
    } catch (error: any) {
        const detail = error instanceof JevError ? `${error.message}${error.body ? `: ${error.body}` : ''}` : String(error?.message ?? error);
        console.error(`🛡️ Jev screen failed (${input.source}, let through): ${detail}`);
        logger.error('Jev screen request failed', {
            gameId: input.gameId, userId: input.userEmail, agentName: SCREEN_AGENT_NAME, activity: 'jev_screen',
            source: input.source, error: detail, status: error instanceof JevError ? error.status : undefined,
        });
        await saveJevScreenCall({
            ...base, model: JEV_MODEL, verdict: 'error', reason: null, riskScore: null, highRisk: null, flags: null,
            enforced: false, error: detail, httpStatus: error instanceof JevError ? (error.status ?? undefined) : undefined,
        });
        return { verdict: 'error', reason: null, mode, blocked: false };
    }

    await recordScreenSpend(
        input.gameId,
        { inputTokens: result.inputTokens, outputTokens: 0, costUSD: result.costUSD, durationMs: result.durationMs },
        input.userEmail,
        result.model,
        JEV_API_KEY_NAME
    );

    const decision = decideScreen(result.answers);
    const blocked = mode === 'enforce' && decision.verdict === 'would_block';
    const summary = `${decision.verdict}${decision.reason ? ` (${decision.reason})` : ''} score=${decision.riskScore.toFixed(2)} high=${decision.highRisk.toFixed(2)} ` +
        FLAG_NAMES.map(flag => `${flag}=${decision.flags[flag].toFixed(2)}`).join(' ');
    console.log(`🛡️ Jev screen [${mode}] ${input.source}: ${summary} — ${result.durationMs} ms, ${result.inputTokens} tokens${blocked ? ' → REJECTED' : ''}`);

    await saveJevScreenCall({
        ...base, model: result.model, answers: result.answers,
        inputTokens: result.inputTokens, costUSD: result.costUSD, durationMs: result.durationMs,
        verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        flags: decision.flags, enforced: blocked,
    });

    const logLevel = decision.verdict === 'would_block' ? 'warn' : 'info';
    logger[logLevel](`Jev screen ${decision.verdict}${blocked ? ' (rejected)' : ''}`, {
        gameId: input.gameId, userId: input.userEmail, activity: 'jev_screen', source: input.source, mode,
        verdict: decision.verdict, reason: decision.reason, riskScore: decision.riskScore, highRisk: decision.highRisk,
        durationMs: result.durationMs,
    });
    logger.agentActivity(SCREEN_AGENT_NAME, result.model, 'jev_screen', {
        gameId: input.gameId,
        userId: input.userEmail,
        history: [{ role: MESSAGE_ROLE.USER, content: JSON.stringify(state) }],
        command: JSON.stringify(questions),
        reply: { answers: result.answers, decision, mode, enforced: blocked },
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
