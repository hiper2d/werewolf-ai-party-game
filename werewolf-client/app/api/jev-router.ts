/**
 * Speaker router backed by Jev (typesafe.ai System One) instead of the Game Master LLM.
 *
 * One sub-second call answers, for the current day's discussion: how strongly each alive bot
 * should reply to the latest message (one independent score per bot, so several can be high
 * at once), which quiet bot the topic concerns, and whether the latest exchange is dramatic
 * enough to illustrate.
 * Everything Jev is bad at — counting, fairness, randomness, the size of the set — is done
 * here in code (see composeSpeakerSet).
 *
 * Used by selectRespondingBots when a Jev key is configured; otherwise the LLM router runs.
 */

import {
    AgentLoggingConfig,
    BOT_SELECTION_CONFIG,
    BotResponseError,
    Game,
    GAME_MASTER,
    GAME_STATES,
    GameMessage,
    MessageType,
    RECIPIENT_ALL,
    RECIPIENT_NONE,
} from "@/app/api/game-models";
import { askJev, JEV_API_KEY_NAME, JEV_MODEL, JevChoiceQuestion, JevError, JevNoulQuestion, JevScoreQuestion } from "@/app/ai/jev-client";
import { addMessageToChatAndSaveToDb } from "@/app/api/game-actions";
import { recordRouterSpend } from "@/app/api/cost-tracking";
import { assertFreeSpendWithinLimit } from "@/app/api/user-actions";
import { convertMessageContent } from "@/app/utils/message-utils";
import { midGameImagesEnabled, runDayIllustration } from "@/app/utils/illustration-generation";
import { logger } from "@/app/utils/logger";
import { saveJevRouterCall } from "@/app/api/jev-records";
import { format } from "@/app/ai/prompts/utils";
import {
    JEV_DRAMATIC_QUESTION,
    JEV_QUIET_PICK_QUESTION,
    JEV_REPLY_QUESTION,
    JEV_REPLY_SCORE_LEVELS,
    JEV_STATE_GAME_AFTER,
    JEV_STATE_GAME_DAY,
} from "@/app/ai/prompts/jev-router-prompts";
import { after } from "next/server";

export const JEV_ROUTER_CONFIG = {
    /** How many bots reply to one message: a random count in this range keeps the rhythm uneven. */
    MIN_COUNT: 2,
    MAX_COUNT: 5,
    /**
     * A bot whose reply score lands on the top level ("must reply now": asked, accused, insulted
     * or addressed by name in the latest message) with at least this probability is always picked.
     */
    MUST_REPLY_PROBABILITY: 0.6,
    /**
     * Fairness: the quiet pool is the N least-active bots of the day (ties at the boundary
     * included), and each selection pulls 1–2 of them in — the old GM prompt's "⚠️NEEDS TURN"
     * rule, now enforced in code instead of requested from a model.
     */
    QUIET_POOL_SIZE: 3,
    QUIET_SLOTS_MIN: 1,
    QUIET_SLOTS_MAX: 2,
    /**
     * Above this the latest exchange is dramatic enough to spend an illustration on. Jev rates
     * ordinary grilling at 0.6–0.76 already, so this sits high to keep illustrations rare
     * (runDayIllustration additionally caps them at one per day).
     */
    DRAMATIC_THRESHOLD: 0.85,
    /** Keep the state under Jev's 32k-token limit: roughly 4 chars per token, with headroom. */
    MAX_DISCUSSION_CHARS: 90_000,
} as const;

/**
 * Every router call shows up in Better Stack as an agent row (`Agent jev_router: Game Master
 * (jev-…)`) carrying only the DECISION and usage — not the request (the whole day's
 * discussion plus the questions) and not the raw answers. The full, untruncated copy lives
 * in Firestore (`jevRouterCalls`, saveJevRouterCall); that is what scripts/jev-replay.ts
 * replays the selection logic against.
 */
const JEV_ROUTER_LOG_CONFIG: AgentLoggingConfig = {
    enabled: true,
    logSystemPrompt: false,
    history: { enabled: false, maxCharactersPerMessage: 0 },
    logCommand: false,
    reply: { mode: 'raw', maxReplyChars: -1, maxThinkingChars: 0, includeReasoning: false, includeUsage: true },
};

export interface SpeakerSignal {
    name: string;
    /** Jev's weighted reply score, 0 (not in the thread) … 3 (must reply now). Ranks the fill. */
    score: number;
    /** Jev's probability that the score sits on the top level: directly addressed in the latest message. */
    mustReply: number;
    /**
     * Among the quiet pool only: Jev's probability that this is the quiet bot the current
     * topic most concerns. 0 for bots outside the pool or when the question wasn't asked.
     */
    quietRelevance?: number;
}

export interface ComposeSpeakerSetInput {
    signals: SpeakerSignal[];
    /** Messages each bot has sent today (game.dayActivityCounter). Missing = 0. */
    activity: Record<string, number>;
    /** Author of the latest message; never picked to reply to themselves. */
    lastAuthor: string | null;
    /** Injectable for deterministic tests. */
    random?: () => number;
}

export interface ComposedSpeakerSet {
    selected: string[];
    /** Bots on the "must reply now" level (MUST_REPLY_PROBABILITY). */
    must: string[];
    /** The quiet-pool bots pulled in for fairness (1–2, in queue order). */
    quiet: string[];
    /** The quiet pool the fairness slots were drawn from (least-active bots of the day). */
    quietPool: string[];
    /** The count the random draw asked for, before must/fairness adjustments. */
    target: number;
}

function shuffle<T>(items: T[], random: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * The least-active bots of the day: the `poolSize` lowest message counts, extended to
 * include everyone tied with the boundary (so a fresh day, where everyone is at 0, makes
 * the whole roster the pool). Shared by the request builder (to ask Jev about the pool)
 * and the composer (to reserve the slots), so both see the same names.
 */
export function quietPool(names: string[], activity: Record<string, number>, poolSize = JEV_ROUTER_CONFIG.QUIET_POOL_SIZE): string[] {
    const activityOf = (name: string) => activity[name] || 0;
    const sorted = [...names].sort((a, b) => activityOf(a) - activityOf(b));
    if (sorted.length <= poolSize) return sorted;
    const boundary = activityOf(sorted[poolSize - 1]);
    return sorted.filter(name => activityOf(name) <= boundary);
}

/**
 * Turn Jev's per-bot probabilities into the ordered list of bots that reply next.
 *
 * 1. The latest message's author never replies to themselves.
 * 2. Rank by reply score; near-ties (same hundredth) are shuffled so equal bots don't
 *    come out in roster order every time.
 * 3. Bots on the "must reply now" level (top-level probability ≥ MUST_REPLY_PROBABILITY)
 *    are always in, strongest first.
 * 4. Draw the set size at random from [MIN_COUNT, MAX_COUNT] — the count is not
 *    something the model should decide, and a fixed count makes the room feel mechanical.
 * 5. Fairness: 1–2 bots from the quiet pool (the least-active bots of the day) always
 *    get a slot, so nobody sits silent all day. Within the pool, fewer messages wins,
 *    then the one Jev says the current topic concerns most, then chance. Jev can't
 *    count, so the counting stays in code; it only says which quiet bot fits the topic.
 * 6. Fill the remaining slots down the ranking.
 */
export function composeSpeakerSet(input: ComposeSpeakerSetInput): ComposedSpeakerSet {
    const random = input.random ?? Math.random;
    const cfg = JEV_ROUTER_CONFIG;

    let candidates = input.signals;
    if (input.lastAuthor && candidates.length > 1) {
        candidates = candidates.filter(s => s.name !== input.lastAuthor);
    }
    if (candidates.length === 0) {
        return { selected: [], must: [], quiet: [], quietPool: [], target: 0 };
    }

    const cap = Math.min(BOT_SELECTION_CONFIG.MAX, cfg.MAX_COUNT, candidates.length);

    // Rank: reply score descending, near-ties (same hundredth) in random order.
    const ranked = shuffle(candidates, random)
        .map((s, order) => ({ s, order, bucket: Math.round(s.score * 100) }))
        .sort((a, b) => b.bucket - a.bucket || a.order - b.order)
        .map(x => x.s);

    const must = ranked
        .filter(s => s.mustReply >= cfg.MUST_REPLY_PROBABILITY)
        .map(s => s.name);

    const minCount = Math.min(cfg.MIN_COUNT, cap);
    const target = minCount + Math.floor(random() * (cap - minCount + 1));

    // Fairness: the quiet pool, ordered by fewest messages, then Jev's "this topic concerns
    // them" probability (in 5-point buckets), then chance.
    const activityOf = (name: string) => input.activity[name] || 0;
    const pool = quietPool(candidates.map(s => s.name), input.activity);
    const relevanceOf = (name: string) => candidates.find(s => s.name === name)?.quietRelevance ?? 0;
    const orderedPool = shuffle(pool, random)
        .map((name, order) => ({ name, order, activity: activityOf(name), relevance: Math.round(relevanceOf(name) * 20) }))
        .sort((a, b) => a.activity - b.activity || b.relevance - a.relevance || a.order - b.order)
        .map(x => x.name);
    const quietSlots = cap >= 3
        ? cfg.QUIET_SLOTS_MIN + Math.floor(random() * (cfg.QUIET_SLOTS_MAX - cfg.QUIET_SLOTS_MIN + 1))
        : cfg.QUIET_SLOTS_MIN;

    let selected = must.slice(0, cap);
    // A must-pick only counts as the fairness slot when it is tied for the FEWEST messages;
    // being merely inside the pool (boundary ties) doesn't let a chatty bot stand in for a silent one.
    const minActivity = pool.length > 0 ? Math.min(...pool.map(activityOf)) : 0;
    const quiet: string[] = selected.filter(name => pool.includes(name) && activityOf(name) === minActivity);
    for (const name of orderedPool) {
        if (quiet.length >= quietSlots) break;
        if (selected.includes(name)) continue;
        if (selected.length >= cap) {
            // The first quiet slot is guaranteed: drop the weakest "must" to make room.
            // Further quiet slots are best-effort and never push out a must-pick.
            if (quiet.length > 0) break;
            selected = selected.slice(0, cap - 1);
        }
        selected.push(name);
        quiet.push(name);
    }

    const size = Math.min(cap, Math.max(target, selected.length));
    for (const s of ranked) {
        if (selected.length >= size) break;
        if (!selected.includes(s.name)) {
            selected.push(s.name);
        }
    }

    return { selected, must, quiet, quietPool: pool, target };
}

type ReplyKey = `reply_${string}`;

type RouterQuestions = {
    dramatic: JevNoulQuestion;
    /** Only when the quiet pool has at least two bots to choose between. */
    quiet_pick?: JevChoiceQuestion;
} & Record<ReplyKey, JevScoreQuestion>;

function replyKey(name: string): ReplyKey {
    return `reply_${name}`;
}

/** Key of the last reply-score level ("must reply now") in Jev's probabilities map. */
const TOP_LEVEL = String(JEV_REPLY_SCORE_LEVELS.length - 1);

/** Builds the Jev state (the day's discussion as the model sees it) and the fan-out questions. */
export function buildRouterRequest(game: Game, dayMessages: GameMessage[], candidateNames: string[]): {
    state: Record<string, unknown>;
    questions: RouterQuestions;
    lastAuthor: string | null;
} {
    const lines: string[] = [];
    let chars = 0;
    // Newest messages matter most: walk backwards and stop when the budget is spent.
    for (let i = dayMessages.length - 1; i >= 0; i--) {
        const m = dayMessages[i];
        if (m.authorName === GAME_MASTER) continue;
        const line = `${m.authorName}: ${convertMessageContent(m)}`;
        if (chars + line.length > JEV_ROUTER_CONFIG.MAX_DISCUSSION_CHARS && lines.length > 0) break;
        lines.unshift(line);
        chars += line.length;
    }
    const lastAuthor = [...dayMessages].reverse().find(m => m.authorName !== GAME_MASTER)?.authorName ?? null;
    const isAfterGame = game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    const pool = quietPool(candidateNames.filter(name => name !== lastAuthor), game.dayActivityCounter || {});

    const state = {
        game: isAfterGame ? JEV_STATE_GAME_AFTER : JEV_STATE_GAME_DAY,
        human_player: game.humanPlayerName,
        bots: candidateNames,
        // The quiet pool is deliberately NOT in the state: listing it there measurably inflated
        // those bots' reply scores (2026-09-19 probe: +0.5 for uninvolved pool members). The
        // pool only appears as the options of quiet_pick.
        discussion: lines,
        latest_message: lines[lines.length - 1] ?? '',
    };

    const questions: RouterQuestions = {
        dramatic: {
            type: 'noul',
            instructions: JEV_DRAMATIC_QUESTION,
        },
        ...(pool.length >= 2 ? {
            quiet_pick: {
                type: 'choice' as const,
                instructions: JEV_QUIET_PICK_QUESTION,
                criteria: Object.fromEntries(pool.map(name => [name, null])),
            },
        } : {}),
        ...Object.fromEntries(candidateNames.map(name => [replyKey(name), {
            type: 'score' as const,
            instructions: format(JEV_REPLY_QUESTION, { bot_name: name }),
            criteria: [...JEV_REPLY_SCORE_LEVELS],
        }])),
    };

    return { state, questions, lastAuthor };
}

/**
 * The Jev call itself failed (network, timeout, 5xx, 429, or an auth/billing refusal such as an
 * empty prepaid balance). selectRespondingBots catches exactly this and falls back to the Game
 * Master LLM router; any other error (e.g. the free-tier spend cap) propagates as before.
 */
export class JevRouterUnavailableError extends BotResponseError {}

/**
 * Ask Jev who replies next and turn the answer into the bot queue. Bills the call, saves the
 * hidden GM_BOT_SELECTION debug message and kicks off the mid-day illustration when the
 * exchange is dramatic. Returns the selected bot names (never empty for a non-empty roster).
 */
export async function selectRespondingBotsWithJev(
    game: Game,
    dayMessages: GameMessage[],
    candidateNames: string[],
    apiKey: string,
    userEmail: string
): Promise<string[]> {
    if (candidateNames.length === 0) {
        return [];
    }

    // Free-tier caps run before every spend; the LLM path gets this from the agent-factory hook.
    await assertFreeSpendWithinLimit(userEmail);

    const { state, questions, lastAuthor } = buildRouterRequest(game, dayMessages, candidateNames);

    // The request and the raw answers are deliberately NOT printed or logged (the state is the
    // whole day's discussion); the Firestore record below keeps the full copy for replay.
    let result;
    try {
        result = await askJev(apiKey, state, questions);
        console.log(`🧭 Jev answered ${Object.keys(questions).length} questions in ${result.durationMs} ms — ${result.inputTokens} input tokens, $${result.costUSD.toFixed(6)} (${result.model})`);
    } catch (error: any) {
        console.error(`🧭 Jev request failed: ${error?.message ?? error}`);
        const detail = error instanceof JevError ? `${error.message}${error.body ? `: ${error.body}` : ''}` : String(error?.message ?? error);
        // The failed request is recorded in full in Firestore (not here) — a bad answer and a
        // refused request both need the exact input to be reproduced.
        logger.error('Jev router request failed', {
            gameId: game.id, userId: userEmail, agentName: GAME_MASTER, activity: 'jev_router',
            error: detail, status: error instanceof JevError ? error.status : undefined,
        });
        await saveJevRouterCall({
            gameId: game.id, userId: userEmail, day: game.currentDay, status: 'error', model: JEV_MODEL,
            state, questions, error: detail, httpStatus: error instanceof JevError ? (error.status ?? undefined) : undefined,
        });
        throw new JevRouterUnavailableError(
            'Game Master failed to select responding bots',
            `Jev speaker router failed: ${detail}`,
            { gmAiType: 'jev', action: 'bot_selection' },
            true
        );
    }

    await recordRouterSpend(
        game.id,
        { inputTokens: result.inputTokens, outputTokens: 0, costUSD: result.costUSD, durationMs: result.durationMs },
        userEmail,
        result.model,
        JEV_API_KEY_NAME
    );

    const quietChoice = result.answers.quiet_pick;
    const signals: SpeakerSignal[] = candidateNames.map(name => {
        const reply = result.answers[replyKey(name)];
        return {
            name,
            score: Number(reply?.score) || 0,
            mustReply: Number(reply?.probabilities?.[TOP_LEVEL]) || 0,
            quietRelevance: Number(quietChoice?.probabilities?.[name]) || 0,
        };
    });
    const composed = composeSpeakerSet({
        signals,
        activity: game.dayActivityCounter || {},
        lastAuthor,
    });
    const selectedBots = composed.selected.slice(0, BOT_SELECTION_CONFIG.MAX);

    const dramatic = Number(result.answers.dramatic?.noul) || 0;
    const isAfterGame = game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION;
    if (!isAfterGame && dramatic >= JEV_ROUTER_CONFIG.DRAMATIC_THRESHOLD && midGameImagesEnabled(game)) {
        // Jev cannot describe the moment; the illustrator's assistant writes its own brief from
        // the excerpt. Fire-and-forget, decorative, at most one per day (claimed in runDayIllustration).
        const discussionExcerpt = dayMessages
            .filter(m => m.recipientName === RECIPIENT_ALL &&
                (m.messageType === MessageType.BOT_ANSWER || m.messageType === MessageType.HUMAN_PLAYER_MESSAGE))
            .slice(-8)
            .map(m => `**${m.authorName}:** ${convertMessageContent(m)}`)
            .join('\n');
        const moment = 'the most dramatic beat of the latest messages (a confrontation, an accusation, or a confession)';
        const day = game.currentDay;
        const gameId = game.id;
        try {
            after(() => runDayIllustration(gameId, userEmail, day, moment, discussionExcerpt).catch(error =>
                logger.warn(`Day illustration kickoff failed for ${gameId}`, { gameId, error: error.message })
            ));
        } catch {
            // Outside a request scope (unit tests, scripts): no illustration.
        }
    }

    const ranking = signals
        .slice()
        .sort((a, b) => b.score - a.score)
        .map(s => `${s.name} ${s.score.toFixed(2)}${s.mustReply >= JEV_ROUTER_CONFIG.MUST_REPLY_PROBABILITY ? ' (must)' : ''}`)
        .join(', ');
    const activity = game.dayActivityCounter || {};
    const quietSummary = composed.quietPool
        .map(name => `${name} ${activity[name] || 0} msgs${quietChoice ? ` / topic ${((quietChoice.probabilities?.[name] || 0) * 100).toFixed(0)}%` : ''}`)
        .join(', ');
    const selectionMessage: GameMessage = {
        id: null,
        recipientName: RECIPIENT_NONE,
        authorName: GAME_MASTER,
        msg: `Jev selected: [${selectedBots.join(', ')}]. Ranked: ${ranking}. Must: [${composed.must.join(', ')}]. Quiet slots: [${composed.quiet.join(', ')}] from pool {${quietSummary}}. Target count: ${composed.target}. Dramatic: ${dramatic.toFixed(2)}. ${result.durationMs} ms, ${result.inputTokens} tokens.`,
        messageType: MessageType.GM_BOT_SELECTION,
        day: game.currentDay,
        timestamp: null
    };
    await addMessageToChatAndSaveToDb(selectionMessage, game.id);

    console.log(`🧭 Jev selected [${selectedBots.join(', ')}] — ranked: ${ranking}; must: [${composed.must.join(', ')}]; quiet: [${composed.quiet.join(', ')}] from pool {${quietSummary}}; target ${composed.target}; dramatic ${dramatic.toFixed(2)}`);

    const decision = {
        selected: selectedBots,
        must: composed.must,
        quiet: composed.quiet,
        quietPool: composed.quietPool,
        target: composed.target,
        lastAuthor,
        dramatic,
        activity,
        config: JEV_ROUTER_CONFIG,
    };

    // Durable copy in Firestore (jevRouterCalls) — Better Stack only keeps rows for days.
    await saveJevRouterCall({
        gameId: game.id, userId: userEmail, day: game.currentDay, status: 'ok', model: result.model,
        state, questions, answers: result.answers, decision,
        inputTokens: result.inputTokens, costUSD: result.costUSD, durationMs: result.durationMs,
    });

    // Better Stack row: the decision and usage only (same row shape as an LLM turn, minus the
    // request and the raw answers — see JEV_ROUTER_LOG_CONFIG).
    logger.agentActivity(GAME_MASTER, result.model, 'jev_router', {
        gameId: game.id,
        userId: userEmail,
        reply: { decision },
        usage: {
            inputTokens: result.inputTokens,
            outputTokens: 0,
            totalTokens: result.inputTokens,
            costUSD: result.costUSD,
            durationMs: result.durationMs,
        },
    }, JEV_ROUTER_LOG_CONFIG);

    return selectedBots;
}
