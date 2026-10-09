/**
 * Jev content screen: the pure verdict (decideScreen), the request shape, and screenHumanInput
 * end to end with mocked Jev and OpenAI Decisions APIs — monitor vs enforce, the Decisions
 * fallback, fail-open, skipping without a key.
 */
const mockAskJev = jest.fn();
const mockGetJevApiKey = jest.fn<string | null, [any]>(() => 'test-key');
jest.mock('@/app/ai/jev-client', () => {
    const actual = jest.requireActual('@/app/ai/jev-client');
    return {
        ...actual,
        askJev: (...args: any[]) => mockAskJev(...args),
        getJevApiKey: (keys: any) => mockGetJevApiKey(keys),
    };
});
const mockAskDecisions = jest.fn();
jest.mock('@/app/ai/openai-decisions-client', () => {
    const actual = jest.requireActual('@/app/ai/openai-decisions-client');
    return { ...actual, askOpenAiDecisions: (...args: any[]) => mockAskDecisions(...args) };
});
const mockMode = jest.fn(async () => 'monitor' as 'off' | 'monitor' | 'enforce');
jest.mock('@/app/api/limits-actions', () => ({ getJevScreenMode: () => mockMode() }));
const mockRecordScreenSpend = jest.fn();
jest.mock('@/app/api/cost-tracking', () => ({ recordScreenSpend: (...args: any[]) => mockRecordScreenSpend(...args) }));
const mockSaveRecord = jest.fn<Promise<void>, [any]>(async () => undefined);
jest.mock('@/app/api/jev-records', () => ({ saveJevScreenCall: (record: any) => mockSaveRecord(record) }));
const mockAgentActivity = jest.fn();
const mockWarn = jest.fn();
jest.mock('@/app/utils/logger', () => ({
    logger: { info: jest.fn(), warn: (...args: any[]) => mockWarn(...args), error: jest.fn(), debug: jest.fn(), agentActivity: (...args: any[]) => mockAgentActivity(...args) },
}));

import { buildScreenRequest, decideScreen, JEV_SCREEN_CONFIG, screenHumanInput, screenRejectionMessage } from '@/app/api/jev-screen';
import { JEV_SCREEN_FLAG_QUESTIONS, JEV_SCREEN_PROMPT_VERSION, JEV_SCREEN_RISK_LEVELS } from '@/app/ai/prompts/jev-screen-prompts';

/** Jev-shaped answers: a risk score with the given per-level probabilities plus flag nouls (default 0.01). */
function answers(levels: number[], flags: Partial<Record<string, number>> = {}) {
    const score = levels.reduce((sum, p, i) => sum + p * i, 0);
    return {
        risk: { type: 'score', score, confidence: 0.9, legend: {}, probabilities: Object.fromEntries(levels.map((p, i) => [String(i), p])) },
        ...Object.fromEntries(Object.keys(JEV_SCREEN_FLAG_QUESTIONS).map(flag => [flag, { type: 'noul', noul: flags[flag] ?? 0.01 }])),
    };
}

function jevResult(a: Record<string, any>) {
    return { model: 'jev-1.13.0', answers: a, usage: { input_tokens: 650, output_tokens: 100 }, inputTokens: 650, costUSD: 0.0000273, durationMs: 210 };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockMode.mockResolvedValue('monitor');
    mockGetJevApiKey.mockReturnValue('test-key');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('decideScreen', () => {
    it('ordinary game talk is ok', () => {
        const d = decideScreen(answers([0.87, 0.11, 0.02, 0]));
        expect(d.verdict).toBe('ok');
        expect(d.reason).toBeNull();
        expect(d.riskScore).toBeCloseTo(0.15);
        expect(d.highRisk).toBeCloseTo(0.02);
    });

    it('gore and dark themes land in the grey zone, never blocked', () => {
        const d = decideScreen(answers([0.1, 0.6, 0.3, 0]));
        expect(d.riskScore).toBeCloseTo(1.2);
        expect(d.verdict).toBe('grey');
    });

    it('the score never blocks: high risk is grey and names the strongest flag', () => {
        const d = decideScreen(answers([0, 0.03, 0.97, 0], { sexual: 0.97, minors: 0.5 }));
        expect(d.verdict).toBe('grey');
        expect(d.reason).toBe('sexual');
    });

    it('falls back to "score" as the reason when no flag is confident', () => {
        const d = decideScreen(answers([0, 0.2, 0.8, 0], { jailbreak: 0.3 }));
        expect(d.verdict).toBe('grey');
        expect(d.reason).toBe('score');
    });

    it('a hard flag blocks on its own even when the score is low', () => {
        const d = decideScreen(answers([0.5, 0.4, 0.1, 0], { minors: 0.95 }));
        expect(d.verdict).toBe('would_block');
        expect(d.reason).toBe('minors');
    });

    it('a hard flag below its bar does not block by itself (minors leaned to 0.5 on "loyal boy")', () => {
        const d = decideScreen(answers([0.5, 0.45, 0.05, 0], { minors: 0.5 }));
        expect(d.verdict).toBe('ok');
    });

    it('the jailbreak flag alone is not a hard block', () => {
        const d = decideScreen(answers([0.1, 0.5, 0.35, 0.05], { jailbreak: 0.99 }));
        expect(d.verdict).toBe('grey');
    });

    it('a high-risk line without a hard flag is grey and keeps its reason, never would_block', () => {
        const d = decideScreen(answers([0, 0.03, 0.97, 0], { sexual: 0.91, real_harm: 0.72 }));
        expect(d.verdict).toBe('grey');
        expect(d.reason).toBe('sexual');
    });

    it('hate is a hard flag: it blocks however the score reads', () => {
        const d = decideScreen(answers([0, 0.05, 0.95, 0], { hate: 0.98 }));
        expect(d.verdict).toBe('would_block');
        expect(d.reason).toBe('hate');
    });

    it('tolerates missing answers', () => {
        const d = decideScreen({});
        expect(d.verdict).toBe('ok');
        expect(d.riskScore).toBe(0);
    });
});

describe('buildScreenRequest', () => {
    it('asks one score with the configured levels and one noul per flag', () => {
        const { state, questions } = buildScreenRequest('chat', 'hello');
        expect(state.text).toBe('hello');
        expect(String(state.context)).toContain('chat');
        expect(questions.risk.type).toBe('score');
        expect(questions.risk.criteria).toEqual([...JEV_SCREEN_RISK_LEVELS]);
        for (const flag of Object.keys(JEV_SCREEN_FLAG_QUESTIONS)) {
            expect((questions as any)[flag]).toEqual({ type: 'noul', instructions: (JEV_SCREEN_FLAG_QUESTIONS as any)[flag] });
        }
    });

    it('uses the setup framing for previews', () => {
        const { state } = buildScreenRequest('preview', 'x');
        expect(String(state.context)).toContain('new Werewolf party game');
    });
});

describe('screenRejectionMessage', () => {
    it('names the category in plain words, never a score', () => {
        expect(screenRejectionMessage('chat', 'sexual')).toBe("This message can't be sent to the AI players because it contains sexual content. Please rephrase it.");
        expect(screenRejectionMessage('preview', 'score')).toBe("This game setup can't be sent to the AI players. Please rephrase it.");
    });
});

describe('screenHumanInput', () => {
    const input = { source: 'chat' as const, text: 'Come here, my loyal boy.', userEmail: 'p@example.com', apiKeys: {}, gameId: 'g1', day: 2 };

    it('skips without a key: no call, no record', async () => {
        mockGetJevApiKey.mockReturnValue(null);
        const out = await screenHumanInput(input);
        expect(out).toEqual({ verdict: 'skipped', reason: null, mode: 'off', blocked: false });
        expect(mockAskJev).not.toHaveBeenCalled();
        expect(mockSaveRecord).not.toHaveBeenCalled();
    });

    it('skips when the mode is off', async () => {
        mockMode.mockResolvedValue('off');
        const out = await screenHumanInput(input);
        expect(out.verdict).toBe('skipped');
        expect(mockAskJev).not.toHaveBeenCalled();
    });

    const setup = { ...input, source: 'preview' as const };
    // A would-block needs a hard flag; the score alone never blocks.
    const minorsAnswers = () => answers([0, 0.03, 0.97, 0], { sexual: 0.97, minors: 0.96 });

    it('monitor mode records a would-block verdict, bills it, and lets the text through', async () => {
        mockAskJev.mockResolvedValue(jevResult(minorsAnswers()));
        const out = await screenHumanInput(setup);
        expect(out).toEqual({ verdict: 'would_block', reason: 'minors', mode: 'monitor', blocked: false });

        expect(mockAskJev).toHaveBeenCalledTimes(1);
        const [, , , options] = mockAskJev.mock.calls[0];
        expect(options.timeoutMs).toBe(JEV_SCREEN_CONFIG.TIMEOUT_MS);

        expect(mockRecordScreenSpend).toHaveBeenCalledWith('g1', expect.objectContaining({ inputTokens: 650, costUSD: 0.0000273 }), 'p@example.com', 'jev-1.13.0', 'TYPESAFE_API_KEY');

        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        const record = mockSaveRecord.mock.calls[0][0];
        expect(record).toMatchObject({
            gameId: 'g1', userEmail: 'p@example.com', source: 'preview', day: 2, text: input.text,
            promptVersion: JEV_SCREEN_PROMPT_VERSION, model: 'jev-1.13.0', verdict: 'would_block', reason: 'minors',
            mode: 'monitor', enforced: false, thresholds: JEV_SCREEN_CONFIG,
        });
        expect(record.state.text).toBe(input.text);
        expect(record.questions.risk.criteria).toEqual([...JEV_SCREEN_RISK_LEVELS]);
        expect(record.answers.sexual.noul).toBe(0.97);
        expect(record.flags.sexual).toBe(0.97);
        expect(record.riskScore).toBeCloseTo(1.97);

        expect(mockWarn).toHaveBeenCalledWith('Jev screen would_block', expect.objectContaining({ activity: 'jev_screen', reason: 'minors' }));
        expect(mockAgentActivity).toHaveBeenCalledWith('Content screen', 'jev-1.13.0', 'jev_screen', expect.objectContaining({ gameId: 'g1' }), expect.anything());
    });

    it('enforce mode rejects a would-block verdict with a message and marks the record enforced', async () => {
        mockMode.mockResolvedValue('enforce');
        mockAskJev.mockResolvedValue(jevResult(minorsAnswers()));
        const out = await screenHumanInput(setup);
        expect(out.blocked).toBe(true);
        expect(out.message).toBe("This game setup can't be sent to the AI players because it sexualizes a minor. Please rephrase it.");
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ mode: 'enforce', enforced: true });
    });

    it('enforce mode lets ok and grey text through', async () => {
        mockMode.mockResolvedValue('enforce');
        mockAskJev.mockResolvedValue(jevResult(answers([0.1, 0.6, 0.3, 0])));
        const out = await screenHumanInput(input);
        expect(out).toEqual({ verdict: 'grey', reason: null, mode: 'enforce', blocked: false });
    });

    it('fails open: a Jev error is recorded and the text goes through, even in enforce mode', async () => {
        mockMode.mockResolvedValue('enforce');
        mockAskJev.mockRejectedValue(new Error('This operation was aborted'));
        const out = await screenHumanInput(input);
        expect(out).toEqual({ verdict: 'error', reason: null, mode: 'enforce', blocked: false });
        expect(mockRecordScreenSpend).not.toHaveBeenCalled();
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ verdict: 'error', error: 'This operation was aborted', enforced: false });
        expect(mockSaveRecord.mock.calls[0][0].shadow).toBeUndefined();
        expect(mockAskDecisions).not.toHaveBeenCalled();
    });

    describe('both judges, asked at once', () => {
        const withOpenAi = { ...setup, apiKeys: { OPENAI_API_KEY: 'sk-test' } };
        const decisionsResult = (a: Record<string, any>) => ({ ...jevResult(a), model: 'gpt-6-luna', costUSD: 0.000065, durationMs: 400 });

        it('Jev decides; the Decisions answer is billed and recorded as the shadow on the same row', async () => {
            mockAskJev.mockResolvedValue(jevResult(answers([0, 0.2, 0.8, 0], { sexual: 0.9 })));
            mockAskDecisions.mockResolvedValue(decisionsResult(answers([0.4, 0.5, 0.1, 0])));

            const out = await screenHumanInput(withOpenAi);
            expect(out).toMatchObject({ verdict: 'grey', reason: 'sexual' });

            const [key, state, questions, options] = mockAskDecisions.mock.calls[0];
            expect(key).toBe('sk-test');
            expect(state.text).toBe(input.text);
            expect(Object.keys(questions)).toEqual(Object.keys(mockAskJev.mock.calls[0][2]));
            expect(options.timeoutMs).toBe(JEV_SCREEN_CONFIG.DECISIONS_TIMEOUT_MS);

            expect(mockRecordScreenSpend.mock.calls.map(c => [c[3], c[4]])).toEqual([
                ['jev-1.13.0', 'TYPESAFE_API_KEY'],
                ['gpt-6-luna', 'OPENAI_API_KEY'],
            ]);
            expect(mockSaveRecord).toHaveBeenCalledTimes(1);
            const record = mockSaveRecord.mock.calls[0][0];
            expect(record).toMatchObject({ model: 'jev-1.13.0', verdict: 'grey', reason: 'sexual' });
            expect(record.shadow).toMatchObject({ model: 'gpt-6-luna', verdict: 'ok', reason: null, costUSD: 0.000065, durationMs: 400 });
            expect(record.shadow.riskScore).toBeCloseTo(0.7);
            expect(record.shadow.answers.risk).toBeDefined();
        });

        it('asks both at once: the wait is the slower call, not the sum', async () => {
            let resolveJev: (v: any) => void = () => undefined;
            mockAskJev.mockReturnValue(new Promise(resolve => { resolveJev = resolve; }));
            mockAskDecisions.mockResolvedValue(decisionsResult(answers([0.9, 0.1, 0, 0])));
            const call = screenHumanInput(withOpenAi);
            await new Promise(resolve => setImmediate(resolve));
            expect(mockAskDecisions).toHaveBeenCalledTimes(1);
            resolveJev(jevResult(answers([0.9, 0.1, 0, 0])));
            expect((await call).verdict).toBe('ok');
        });

        it('when Jev fails, Decisions decides and enforces, and the Jev error is the shadow', async () => {
            mockMode.mockResolvedValue('enforce');
            mockAskJev.mockRejectedValue(Object.assign(new Error('Jev returned HTTP 529'), { status: 529, body: 'overloaded' }));
            mockAskDecisions.mockResolvedValue(decisionsResult(minorsAnswers()));

            const out = await screenHumanInput(withOpenAi);
            expect(out).toMatchObject({ verdict: 'would_block', reason: 'minors', blocked: true });
            expect(mockRecordScreenSpend).toHaveBeenCalledTimes(1);
            expect(mockRecordScreenSpend).toHaveBeenCalledWith('g1', expect.objectContaining({ costUSD: 0.000065 }), 'p@example.com', 'gpt-6-luna', 'OPENAI_API_KEY');

            expect(mockSaveRecord).toHaveBeenCalledTimes(1);
            const record = mockSaveRecord.mock.calls[0][0];
            expect(record).toMatchObject({ model: 'gpt-6-luna', verdict: 'would_block', enforced: true });
            expect(record.shadow).toEqual({
                model: 'jev-latest', verdict: 'error', reason: null, riskScore: null, highRisk: null, flags: null,
                error: 'Jev returned HTTP 529: overloaded', httpStatus: 529,
            });
        });

        it('lets the text through only when both fail: one error row, Jev\'s error on it, Decisions\' in the shadow', async () => {
            mockMode.mockResolvedValue('enforce');
            mockAskJev.mockRejectedValue(new Error('Jev request timed out after 3002 ms'));
            mockAskDecisions.mockRejectedValue(new Error('OpenAI Decisions refused: risk'));

            const out = await screenHumanInput(withOpenAi);
            expect(out).toEqual({ verdict: 'error', reason: null, mode: 'enforce', blocked: false });
            expect(mockRecordScreenSpend).not.toHaveBeenCalled();
            expect(mockSaveRecord).toHaveBeenCalledTimes(1);
            const record = mockSaveRecord.mock.calls[0][0];
            expect(record).toMatchObject({ model: 'jev-latest', verdict: 'error', error: 'Jev request timed out after 3002 ms' });
            expect(record.shadow).toMatchObject({ model: 'gpt-6-luna', verdict: 'error', error: 'OpenAI Decisions refused: risk' });
        });

        it('a Decisions failure alone changes nothing for the player: Jev decides, the shadow records the error', async () => {
            mockAskJev.mockResolvedValue(jevResult(answers([0.9, 0.1, 0, 0])));
            mockAskDecisions.mockRejectedValue(new Error('OpenAI Decisions returned HTTP 500'));
            const out = await screenHumanInput(withOpenAi);
            expect(out.verdict).toBe('ok');
            expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ model: 'jev-1.13.0', verdict: 'ok', shadow: { verdict: 'error' } });
        });

        it('screens on Decisions alone when there is no Jev key', async () => {
            mockGetJevApiKey.mockReturnValue(null);
            mockAskDecisions.mockResolvedValue(decisionsResult(answers([0.9, 0.1, 0, 0])));
            const out = await screenHumanInput(withOpenAi);
            expect(out.verdict).toBe('ok');
            expect(mockAskJev).not.toHaveBeenCalled();
            expect(mockSaveRecord.mock.calls[0][0].shadow).toBeUndefined();
        });
    });

    it('gives Jev 3 s, then fails open on the timeout and records it', async () => {
        const { askJev } = jest.requireActual('@/app/ai/jev-client');
        mockAskJev.mockImplementation(askJev);
        (global as any).fetch = jest.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
        }));
        mockMode.mockResolvedValue('enforce');
        jest.useFakeTimers();
        try {
            const call = screenHumanInput({ ...input, source: 'preview' });
            const settled = jest.fn();
            call.then(settled, settled);

            await jest.advanceTimersByTimeAsync(JEV_SCREEN_CONFIG.TIMEOUT_MS - 1);
            expect(settled).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(1);

            expect(JEV_SCREEN_CONFIG.TIMEOUT_MS).toBe(3_000);
            expect(await call).toEqual({ verdict: 'error', reason: null, mode: 'enforce', blocked: false });
            expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({
                verdict: 'error', error: 'Jev request timed out after 3000 ms', httpStatus: undefined, enforced: false,
            });
            expect(mockRecordScreenSpend).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('a preview has no game: billed without a game id', async () => {
        mockAskJev.mockResolvedValue(jevResult(answers([0.9, 0.1, 0, 0])));
        const out = await screenHumanInput({ source: 'preview', text: 'Theme: a snowed-in mansion', userEmail: 'p@example.com', apiKeys: {} });
        expect(out.verdict).toBe('ok');
        expect(mockRecordScreenSpend.mock.calls[0][0]).toBeUndefined();
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ gameId: null, day: null, source: 'preview' });
    });
});
