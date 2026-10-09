/**
 * Jev speaker router: the pure set composition (count, fairness, must-picks) and the
 * end-to-end selection with a mocked Jev API (billing, debug message, error tagging).
 */
import { BotResponseError, GAME_MASTER, GAME_STATES, MessageType, RECIPIENT_ALL } from '@/app/api/game-models';

const savedMessages: any[] = [];
const mockRecordRouterSpend = jest.fn();
const mockAssertFreeSpend = jest.fn(async () => undefined);

jest.mock('@/app/api/game-actions', () => ({
    addMessageToChatAndSaveToDb: jest.fn(async (m: any) => { savedMessages.push(m); return m; }),
}));
jest.mock('@/app/api/cost-tracking', () => ({ recordRouterSpend: (...args: any[]) => mockRecordRouterSpend(...args) }));
jest.mock('@/app/api/user-actions', () => ({ assertFreeSpendWithinLimit: (...args: any[]) => mockAssertFreeSpend(...(args as [])) }));
jest.mock('@/app/utils/illustration-generation', () => ({ midGameImagesEnabled: () => false, runDayIllustration: jest.fn() }));
jest.mock('next/server', () => ({ after: (fn: () => void) => fn() }));
const mockSaveRecord = jest.fn<Promise<string | null>, [any]>(async () => 'row-1');
const mockSaveShadow = jest.fn<Promise<void>, [string, string, any]>(async () => undefined);
jest.mock('@/app/api/jev-records', () => ({
    saveJevRouterCall: (record: any) => mockSaveRecord(record),
    saveJevRouterShadow: (id: string, gameId: string, shadow: any) => mockSaveShadow(id, gameId, shadow),
}));
const mockAgentActivity = jest.fn();
jest.mock('@/app/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), agentActivity: (...args: any[]) => mockAgentActivity(...args) },
}));

import { buildRouterRequest, composeSpeakerSet, JEV_JUDGE, JEV_ROUTER_CONFIG, JevRouterUnavailableError, OPENAI_DECISIONS_JUDGE, RouterJudge, selectRespondingBotsWithJev } from '@/app/api/jev-router';

/** Deterministic "random": returns the given values in order, then 0. */
function seq(values: number[]): () => number {
    let i = 0;
    return () => (i < values.length ? values[i++] : 0);
}

/** score = Jev's weighted reply score (0–3); mustReply = probability of the top level. */
const sig = (name: string, score: number, mustReply = 0) => ({ name, score, mustReply });

describe('composeSpeakerSet', () => {
    it('always includes bots on the must-reply level and never the latest author', () => {
        const out = composeSpeakerSet({
            signals: [sig('Yuki', 3, 0.99), sig('Kenji', 2.4, 0.83), sig('Takeshi', 1), sig('Akira', 0.2)],
            activity: { Yuki: 1, Takeshi: 1 },
            lastAuthor: 'Takeshi',
            random: () => 0,
        });
        expect(out.must).toEqual(['Yuki', 'Kenji']);
        expect(out.selected).toEqual(expect.arrayContaining(['Yuki', 'Kenji']));
        expect(out.selected).not.toContain('Takeshi');
    });

    it('draws the count from [MIN_COUNT, MAX_COUNT] and fills down the ranking', () => {
        const signals = [sig('A', 3, 0.9), sig('B', 1.5), sig('C', 1.2), sig('D', 0.8), sig('E', 0.1)];
        // shuffle draws (5 candidates → 4 random calls), then the count draw, then the quiet draw
        const withMax = composeSpeakerSet({ signals, activity: {}, lastAuthor: null, random: seq([0, 0, 0, 0, 0.99]) });
        expect(withMax.target).toBe(JEV_ROUTER_CONFIG.MAX_COUNT);
        expect(withMax.selected).toHaveLength(JEV_ROUTER_CONFIG.MAX_COUNT);
        expect(withMax.selected[0]).toBe('A');

        const withMin = composeSpeakerSet({ signals, activity: {}, lastAuthor: null, random: seq([0, 0, 0, 0, 0]) });
        expect(withMin.target).toBe(JEV_ROUTER_CONFIG.MIN_COUNT);
        expect(withMin.selected).toHaveLength(JEV_ROUTER_CONFIG.MIN_COUNT);
    });

    it('reserves a slot for a quiet-pool bot, fewest messages first', () => {
        const signals = [sig('A', 2.9, 0.9), sig('B', 2.6, 0.7), sig('C', 2.5, 0.65), sig('D', 0.5), sig('E', 0.1)];
        const out = composeSpeakerSet({ signals, activity: { A: 3, B: 2, C: 2, D: 1, E: 0 }, lastAuthor: null, random: () => 0 });
        expect(out.quietPool).toEqual(['E', 'D', 'B', 'C']); // 3 lowest counts, boundary ties included
        expect(out.quiet[0]).toBe('E');
        expect(out.selected).toContain('E');
    });

    it('pulls in two quiet bots when the draw says so and there is room', () => {
        const signals = [sig('A', 3, 0.9), sig('B', 0.5), sig('C', 0.5), sig('D', 0.5), sig('E', 0.5)];
        // random → 0.99: shuffles keep order, the count draw hits MAX_COUNT, the quiet-slot draw hits 2
        const out = composeSpeakerSet({ signals, activity: { A: 2, B: 2, C: 0, D: 0, E: 1 }, lastAuthor: null, random: () => 0.99 });
        expect(out.quiet).toHaveLength(2);
        expect(out.quiet).toEqual(expect.arrayContaining(['C', 'D'])); // both at 0 messages beat E at 1
        expect(out.selected[0]).toBe('A');
    });

    it('breaks equal activity by Jev topic relevance inside the quiet pool', () => {
        const signals = [sig('A', 3, 0.9), { ...sig('B', 0.5), quietRelevance: 0.1 }, { ...sig('C', 0.5), quietRelevance: 0.85 }, { ...sig('D', 0.5), quietRelevance: 0.05 }];
        const out = composeSpeakerSet({ signals, activity: { A: 2, B: 0, C: 0, D: 0 }, lastAuthor: null, random: () => 0 });
        expect(out.quiet[0]).toBe('C');
    });

    it('never lets topic relevance outrank a bot with fewer messages', () => {
        const signals = [sig('A', 3, 0.9), { ...sig('B', 0.5), quietRelevance: 0.95 }, { ...sig('C', 0.5), quietRelevance: 0.05 }, sig('D', 0.5)];
        const out = composeSpeakerSet({ signals, activity: { A: 2, B: 1, C: 0, D: 3 }, lastAuthor: null, random: () => 0 });
        expect(out.quiet[0]).toBe('C');
    });

    it('does not let a must-pick inside the pool stand in for a silent bot', () => {
        // pool = E(0) plus A..D tied at 1 (boundary ties); A is a must-pick but has spoken — E still gets the slot
        const signals = [sig('A', 3, 0.9), sig('B', 0.5), sig('C', 0.5), sig('D', 0.5), sig('E', 0.5)];
        const out = composeSpeakerSet({ signals, activity: { A: 1, B: 1, C: 1, D: 1, E: 0 }, lastAuthor: null, random: () => 0 });
        expect(out.quiet).toContain('E');
        expect(out.selected).toContain('E');
    });

    it('drops the weakest must-pick when the set is full and no quiet bot is in it', () => {
        const signals = [sig('A', 2.9, 0.8), sig('B', 2.8, 0.75), sig('C', 2.7, 0.7), sig('D', 2.6, 0.65), sig('E', 0.2)];
        const out = composeSpeakerSet({ signals, activity: { A: 1, B: 1, C: 1, D: 1, E: 0 }, lastAuthor: null, random: () => 0 });
        expect(out.selected).toHaveLength(JEV_ROUTER_CONFIG.MAX_COUNT);
        expect(out.selected).toContain('E');
        expect(out.selected).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    });

    it('counts a must-pick that is already quiet toward the quiet slots', () => {
        const signals = [sig('A', 3, 0.9), sig('B', 1), sig('C', 1)];
        const out = composeSpeakerSet({ signals, activity: { A: 0, B: 3, C: 3 }, lastAuthor: null, random: () => 0 });
        expect(out.quiet).toEqual(['A']);
        expect(out.selected[0]).toBe('A');
    });

    it('handles a single remaining candidate', () => {
        expect(composeSpeakerSet({ signals: [sig('Solo', 3, 1)], activity: {}, lastAuthor: 'You', random: () => 0 }).selected).toEqual(['Solo']);
        expect(composeSpeakerSet({ signals: [sig('Solo', 3, 1)], activity: {}, lastAuthor: 'Solo', random: () => 0 }).selected).toEqual(['Solo']);
        expect(composeSpeakerSet({ signals: [], activity: {}, lastAuthor: null }).selected).toEqual([]);
    });

    it('never returns duplicates and never exceeds the cap', () => {
        const signals = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(n => sig(n, 3, 0.9));
        for (let i = 0; i < 50; i++) {
            const out = composeSpeakerSet({ signals, activity: {}, lastAuthor: 'A' });
            expect(new Set(out.selected).size).toBe(out.selected.length);
            expect(out.selected.length).toBeLessThanOrEqual(JEV_ROUTER_CONFIG.MAX_COUNT);
            expect(out.selected).not.toContain('A');
        }
    });
});

const game: any = {
    id: 'g1',
    currentDay: 2,
    gameState: GAME_STATES.DAY_DISCUSSION,
    humanPlayerName: 'You',
    humanPlayerRole: 'villager',
    bots: [
        { name: 'Alice', role: 'villager', isAlive: true },
        { name: 'Bram', role: 'werewolf', isAlive: true },
        { name: 'Cleo', role: 'villager', isAlive: true },
    ],
    dayActivityCounter: { Alice: 2, Bram: 1, Cleo: 0 },
};

const say = (authorName: string, text: string, human = false): any => ({
    id: null, recipientName: RECIPIENT_ALL, authorName, day: 2, timestamp: 1,
    msg: human ? text : { reply: text },
    messageType: human ? MessageType.HUMAN_PLAYER_MESSAGE : MessageType.BOT_ANSWER,
});

const messages = [
    { id: null, recipientName: RECIPIENT_ALL, authorName: GAME_MASTER, msg: 'Day 2 begins', messageType: MessageType.GM_COMMAND, day: 2, timestamp: 0 },
    say('Alice', 'I think Bram is lying.'),
    say('You', 'Bram, explain yourself.', true),
];

/** Per-bot reply scores as Jev returns them: `score` (0–3 weighted) plus the top-level probability. */
function jevResponse(scores: Record<string, { score: number; top: number }>, dramatic = 0.1) {
    const answers: any = { dramatic: { noul: dramatic } };
    for (const [name, { score, top }] of Object.entries(scores)) {
        const rest = (1 - top) / 3;
        answers[`reply_${name}`] = { score, legend: 'x', probabilities: { '0': rest, '1': rest, '2': rest, '3': top }, confidence: 0.8 };
    }
    return { model: 'jev-1.13.0', answers, usage: { input_tokens: 1500, output_tokens: 0 } };
}

describe('buildRouterRequest', () => {
    it('puts the discussion in state, skips GM messages, and asks one choice plus per-bot nouls', () => {
        const { state, questions, lastAuthor } = buildRouterRequest(game, messages as any, ['Alice', 'Bram', 'Cleo']);
        expect(state.discussion).toEqual(['Alice: I think Bram is lying.', 'You: Bram, explain yourself.']);
        expect(state.latest_message).toBe('You: Bram, explain yourself.');
        expect(lastAuthor).toBe('You');
        expect(Object.keys(questions)).toEqual(expect.arrayContaining(['dramatic', 'reply_Alice', 'reply_Bram', 'reply_Cleo']));
        expect(questions.reply_Bram.type).toBe('score');
        expect(questions.reply_Bram.criteria).toHaveLength(4);
        // pool = the 3 least active (everyone here), excluding the latest author (the human, not a bot anyway);
        // it is the quiet question's options only — never part of the state (it skews the reply scores)
        expect(state).not.toHaveProperty('quiet_bots');
        expect(Object.keys(questions.quiet_pick!.criteria)).toEqual(['Cleo', 'Bram', 'Alice']);
    });

    it('skips the quiet question when the pool has a single bot', () => {
        const { questions } = buildRouterRequest(game, messages as any, ['Alice']);
        expect(questions.quiet_pick).toBeUndefined();
    });
});

describe('selectRespondingBotsWithJev', () => {
    const fetchMock = jest.fn();
    beforeEach(() => {
        jest.clearAllMocks();
        savedMessages.length = 0;
        (global as any).fetch = fetchMock;
    });

    it('runs the same selection on the OpenAI Decisions judge, billed to the OpenAI key', async () => {
        const decisionsScore = (name: string, top: number, score: number) => ({
            type: 'score', name: `reply_${name}`, score, confidence: 0.5,
            probabilities: [0, 1, 2, 3].map(value => ({ value, label: String(value), probability: value === 3 ? top : (1 - top) / 3 })),
        });
        fetchMock.mockResolvedValue({
            ok: true, status: 200,
            text: async () => JSON.stringify({
                model: 'gpt-6-luna',
                answers: [
                    { type: 'predicate', name: 'dramatic', probability: 0.2 },
                    { type: 'choice', name: 'quiet_pick', choice: 'Cleo', confidence: 0.5,
                      probabilities: [{ value: 'Alice', probability: 0.3 }, { value: 'Cleo', probability: 0.7 }] },
                    decisionsScore('Alice', 0.05, 1.2), decisionsScore('Bram', 0.97, 3), decisionsScore('Cleo', 0.02, 0.3),
                ],
                usage: { input_tokens: 2000, output_tokens: 0 },
            }),
        });

        const selected = await selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'sk', 'u@e.com', OPENAI_DECISIONS_JUDGE);

        expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
        expect(selected).toContain('Bram');
        const [, usage, , modelId, keyName] = mockRecordRouterSpend.mock.calls[0];
        expect(usage.costUSD).toBeCloseTo(2000 / 1e6 * 0.10, 10);
        expect(modelId).toBe('gpt-6-luna');
        expect(keyName).toBe('OPENAI_API_KEY');
        expect(savedMessages[0].msg).toContain('OpenAI Decisions selected');
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ status: 'ok', model: 'gpt-6-luna' });
    });

    it('calls Jev once, bills it, saves the debug message, and picks the must-reply bot', async () => {
        fetchMock.mockResolvedValue({
            ok: true, status: 200,
            text: async () => JSON.stringify(jevResponse({ Alice: { score: 1.2, top: 0.05 }, Bram: { score: 3, top: 0.97 }, Cleo: { score: 0.3, top: 0.02 } })),
        });

        const selected = await selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'key', 'u@e.com');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.model).toBe('jev-latest');
        expect(body.state.bots).toEqual(['Alice', 'Bram', 'Cleo']);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer key');

        expect(selected).toContain('Bram');
        expect(selected).toContain('Cleo'); // quiet pool: 0 messages today
        expect(selected).not.toContain('You');
        expect(selected.length).toBeGreaterThanOrEqual(2);

        expect(mockAssertFreeSpend).toHaveBeenCalledWith('u@e.com');
        expect(mockRecordRouterSpend).toHaveBeenCalledTimes(1);
        const [gameId, usage, userEmail, modelId, keyName] = mockRecordRouterSpend.mock.calls[0];
        expect(gameId).toBe('g1');
        expect(usage.inputTokens).toBe(1500);
        expect(usage.costUSD).toBeCloseTo(1500 / 1e6 * 0.042, 10);
        expect(userEmail).toBe('u@e.com');
        expect(modelId).toBe('jev-1.13.0');
        expect(keyName).toBe('TYPESAFE_API_KEY');

        expect(savedMessages).toHaveLength(1);
        expect(savedMessages[0].messageType).toBe(MessageType.GM_BOT_SELECTION);
        expect(savedMessages[0].msg).toContain('Jev selected');

        // Better Stack row: decision + usage only. The request (state, questions) and the raw
        // answers must NOT be in the log — the Firestore record is the full copy.
        expect(mockAgentActivity).toHaveBeenCalledTimes(1);
        const [agentName, model, activity, data, config] = mockAgentActivity.mock.calls[0];
        expect(agentName).toBe(GAME_MASTER);
        expect(model).toBe('jev-1.13.0');
        expect(activity).toBe('jev_router');
        expect(data.gameId).toBe('g1');
        expect(data.history).toBeUndefined();
        expect(data.command).toBeUndefined();
        expect(data.reply.answers).toBeUndefined();
        expect(data.reply.decision.selected).toEqual(selected);
        expect(data.usage.inputTokens).toBe(1500);
        expect(config.history.enabled).toBe(false);
        expect(config.logCommand).toBe(false);

        // ...while the durable Firestore copy carries the full record.
        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        const stored: any = mockSaveRecord.mock.calls[0][0];
        expect(stored).toMatchObject({ gameId: 'g1', userId: 'u@e.com', day: 2, status: 'ok', model: 'jev-1.13.0', inputTokens: 1500 });
        expect(stored.state.bots).toEqual(['Alice', 'Bram', 'Cleo']);
        expect(stored.answers.reply_Bram.score).toBe(3);
        expect(stored.decision.selected).toEqual(selected);
    });

    it('logs a failure without the request, and records the full request in Firestore', async () => {
        const { logger } = jest.requireMock('@/app/utils/logger');
        fetchMock.mockResolvedValue({ ok: false, status: 529, text: async () => 'overloaded' });
        await selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'key', 'u@e.com').catch(() => undefined);
        expect(logger.error).toHaveBeenCalledWith('Jev router request failed', expect.objectContaining({
            gameId: 'g1', activity: 'jev_router', status: 529,
        }));
        const logged = (logger.error as jest.Mock).mock.calls[0][1];
        expect(logged.state).toBeUndefined();
        expect(logged.questions).toBeUndefined();
        expect(mockSaveRecord).toHaveBeenCalledWith(expect.objectContaining({
            gameId: 'g1', status: 'error', httpStatus: 529,
            state: expect.objectContaining({ bots: ['Alice', 'Bram', 'Cleo'] }),
            questions: expect.objectContaining({ reply_Bram: expect.anything() }),
        }));
    });

    it('tags an API failure as a recoverable bot_selection error and bills nothing', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 529, text: async () => '{"error":"overloaded"}' });
        let caught: BotResponseError | undefined;
        try {
            await selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'key', 'u@e.com');
        } catch (e) {
            caught = e as BotResponseError;
        }
        expect(caught).toBeInstanceOf(BotResponseError);
        // selectRespondingBots falls back to the GM LLM router on exactly this class
        expect(caught).toBeInstanceOf(JevRouterUnavailableError);
        expect(caught!.context).toMatchObject({ action: 'bot_selection', gmAiType: 'jev' });
        expect(caught!.recoverable).toBe(true);
        expect(mockRecordRouterSpend).not.toHaveBeenCalled();
        expect(savedMessages).toHaveLength(0);
    });

    it('gives OpenAI Decisions its own 3 s budget', async () => {
        jest.useFakeTimers();
        try {
            fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
            }));
            const call = selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'sk', 'u@e.com', OPENAI_DECISIONS_JUDGE);
            const settled = jest.fn();
            call.then(settled, settled);

            await jest.advanceTimersByTimeAsync(JEV_ROUTER_CONFIG.DECISIONS_TIMEOUT_MS - 1);
            expect(settled).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(1);

            const error = await call.catch(e => e);
            expect(JEV_ROUTER_CONFIG.DECISIONS_TIMEOUT_MS).toBe(3_000);
            expect(error).toBeInstanceOf(JevRouterUnavailableError);
            expect(mockSaveRecord).toHaveBeenCalledWith(expect.objectContaining({
                status: 'error', model: 'gpt-6-luna', error: 'OpenAI Decisions request timed out after 3000 ms',
            }));
        } finally {
            jest.useRealTimers();
        }
    });

    it('gives Jev 2 s, then throws the fallback error and records the timeout', async () => {
        jest.useFakeTimers();
        try {
            fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
            }));
            const call = selectRespondingBotsWithJev(game, messages as any, ['Alice', 'Bram', 'Cleo'], 'key', 'u@e.com');
            const settled = jest.fn();
            call.then(settled, settled);

            await jest.advanceTimersByTimeAsync(JEV_ROUTER_CONFIG.TIMEOUT_MS - 1);
            expect(settled).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(1);

            const error = await call.catch(e => e);
            expect(JEV_ROUTER_CONFIG.TIMEOUT_MS).toBe(2_000);
            expect(error).toBeInstanceOf(JevRouterUnavailableError);
            expect(error.recoverable).toBe(true);
            expect(mockSaveRecord).toHaveBeenCalledWith(expect.objectContaining({
                status: 'error', error: 'Jev request timed out after 2000 ms', httpStatus: undefined,
            }));
            expect(mockRecordRouterSpend).not.toHaveBeenCalled();
            expect(savedMessages).toHaveLength(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it('returns an empty list without calling Jev when there are no candidates', async () => {
        expect(await selectRespondingBotsWithJev(game, messages as any, [], 'key', 'u@e.com')).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('selectRespondingBotsWithJev with a second judge (both asked at once)', () => {
    const names = ['Alice', 'Bram', 'Cleo'];
    /** A judge whose ask is a mock returning a Jev-shaped result (no HTTP). */
    const stubJudge = (base: RouterJudge, model: string, costUSD: number) => {
        const ask = jest.fn();
        const answer = (scores: Record<string, { score: number; top: number }>) =>
            ({ ...jevResponse(scores), model, inputTokens: 1500, costUSD, durationMs: 300 });
        return { judge: { ...base, ask } as RouterJudge, ask, answer };
    };
    const flush = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
        jest.clearAllMocks();
        savedMessages.length = 0;
    });

    it('Jev decides; Decisions is billed and recorded as the shadow, composed with the same random draws', async () => {
        const jev = stubJudge(JEV_JUDGE, 'jev-1.13.0', 0.00006);
        const dec = stubJudge(OPENAI_DECISIONS_JUDGE, 'gpt-6-luna', 0.00015);
        const scores = { Alice: { score: 1.2, top: 0.05 }, Bram: { score: 3, top: 0.97 }, Cleo: { score: 0.3, top: 0.02 } };
        jev.ask.mockResolvedValue(jev.answer(scores));
        // Same answers on purpose: with the replayed draws the shadow set must come out identical.
        dec.ask.mockResolvedValue(dec.answer(scores));

        const selected = await selectRespondingBotsWithJev(game, messages as any, names, 'key', 'u@e.com', jev.judge, { judge: dec.judge, apiKey: 'sk' });
        await flush();

        expect(jev.ask).toHaveBeenCalledTimes(1);
        expect(dec.ask).toHaveBeenCalledTimes(1);
        expect(dec.ask.mock.calls[0][0]).toBe('sk');
        expect(dec.ask.mock.calls[0][1]).toEqual(jev.ask.mock.calls[0][1]);
        expect(savedMessages[0].msg).toContain('Jev selected');
        expect(mockRecordRouterSpend.mock.calls.map(c => [c[3], c[4]])).toEqual([
            ['jev-1.13.0', 'TYPESAFE_API_KEY'],
            ['gpt-6-luna', 'OPENAI_API_KEY'],
        ]);
        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ status: 'ok', model: 'jev-1.13.0' });
        expect(mockSaveRecord.mock.calls[0][0].shadow).toBeUndefined();

        expect(mockSaveShadow).toHaveBeenCalledTimes(1);
        const [rowId, gameId, shadow] = mockSaveShadow.mock.calls[0];
        expect(rowId).toBe('row-1');
        expect(gameId).toBe(game.id);
        expect(shadow).toMatchObject({ model: 'gpt-6-luna', costUSD: 0.00015, durationMs: 300 });
        expect(shadow.answers.reply_Bram.score).toBe(3);
        expect(shadow.decision.selected).toEqual(selected);
        expect(shadow.decision.target).toBe(mockSaveRecord.mock.calls[0][0].decision.target);
    });

    it('when Jev fails, the running Decisions call decides at once and the Jev error is the shadow', async () => {
        const jev = stubJudge(JEV_JUDGE, 'jev-1.13.0', 0.00006);
        const dec = stubJudge(OPENAI_DECISIONS_JUDGE, 'gpt-6-luna', 0.00015);
        jev.ask.mockRejectedValue(Object.assign(new Error('Jev returned HTTP 529'), { status: 529, body: 'busy' }));
        dec.ask.mockResolvedValue(dec.answer({ Alice: { score: 0.4, top: 0.02 }, Bram: { score: 3, top: 0.95 }, Cleo: { score: 0.3, top: 0.02 } }));

        const selected = await selectRespondingBotsWithJev(game, messages as any, names, 'key', 'u@e.com', jev.judge, { judge: dec.judge, apiKey: 'sk' });
        await flush();

        expect(selected).toContain('Bram');
        expect(dec.ask).toHaveBeenCalledTimes(1);
        expect(savedMessages[0].msg).toContain('OpenAI Decisions selected');
        expect(mockRecordRouterSpend).toHaveBeenCalledTimes(1);
        expect(mockRecordRouterSpend.mock.calls[0][4]).toBe('OPENAI_API_KEY');
        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({
            status: 'ok', model: 'gpt-6-luna',
            shadow: { model: 'jev-latest', error: 'Jev returned HTTP 529: busy', httpStatus: 529 },
        });
        expect(mockSaveShadow).not.toHaveBeenCalled();
        const { logger } = jest.requireMock('@/app/utils/logger');
        expect(logger.warn).toHaveBeenCalledWith('Jev router unavailable, falling back to OpenAI Decisions', expect.anything());
    });

    it('throws only when both fail: one error row with Jev\'s error and the Decisions error as the shadow', async () => {
        const jev = stubJudge(JEV_JUDGE, 'jev-1.13.0', 0.00006);
        const dec = stubJudge(OPENAI_DECISIONS_JUDGE, 'gpt-6-luna', 0.00015);
        jev.ask.mockRejectedValue(new Error('Jev request timed out after 2003 ms'));
        dec.ask.mockRejectedValue(new Error('OpenAI Decisions returned HTTP 500'));

        let caught: any;
        try {
            await selectRespondingBotsWithJev(game, messages as any, names, 'key', 'u@e.com', jev.judge, { judge: dec.judge, apiKey: 'sk' });
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(JevRouterUnavailableError);
        expect(caught.details).toContain('Jev request timed out after 2003 ms; OpenAI Decisions: OpenAI Decisions returned HTTP 500');
        expect(mockRecordRouterSpend).not.toHaveBeenCalled();
        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({
            status: 'error', model: 'jev-latest', error: 'Jev request timed out after 2003 ms',
            shadow: { model: 'gpt-6-luna', error: 'OpenAI Decisions returned HTTP 500' },
        });
    });

    it('a Decisions failure alone changes nothing in the game: Jev decides, the shadow records the error', async () => {
        const jev = stubJudge(JEV_JUDGE, 'jev-1.13.0', 0.00006);
        const dec = stubJudge(OPENAI_DECISIONS_JUDGE, 'gpt-6-luna', 0.00015);
        jev.ask.mockResolvedValue(jev.answer({ Alice: { score: 1.2, top: 0.05 }, Bram: { score: 3, top: 0.97 }, Cleo: { score: 0.3, top: 0.02 } }));
        dec.ask.mockRejectedValue(new Error('OpenAI Decisions returned HTTP 500'));

        expect(await selectRespondingBotsWithJev(game, messages as any, names, 'key', 'u@e.com', jev.judge, { judge: dec.judge, apiKey: 'sk' })).toContain('Bram');
        await flush();
        expect(mockRecordRouterSpend).toHaveBeenCalledTimes(1);
        expect(mockSaveShadow.mock.calls[0][2]).toEqual({ model: 'gpt-6-luna', error: 'OpenAI Decisions returned HTTP 500', httpStatus: undefined });
    });
});
