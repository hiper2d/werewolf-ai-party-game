/**
 * Jev content screen: the pure verdict (decideScreen), the request shape, and screenHumanInput
 * end to end with a mocked Jev API — monitor vs enforce, fail-open, skipping without a key.
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

    it('blocks on the top two levels and names the strongest flag', () => {
        const d = decideScreen(answers([0, 0.03, 0.97, 0], { sexual: 0.97, minors: 0.5 }));
        expect(d.verdict).toBe('would_block');
        expect(d.reason).toBe('sexual');
    });

    it('falls back to "score" as the reason when no flag is confident', () => {
        const d = decideScreen(answers([0, 0.2, 0.8, 0], { jailbreak: 0.3 }));
        expect(d.verdict).toBe('would_block');
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

    it('the jailbreak flag alone is not a hard block, only the score is', () => {
        const d = decideScreen(answers([0.1, 0.5, 0.35, 0.05], { jailbreak: 0.99 }));
        expect(d.verdict).toBe('grey');
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

    it('monitor mode records a would-block verdict, bills it, and lets the text through', async () => {
        mockAskJev.mockResolvedValue(jevResult(answers([0, 0.03, 0.97, 0], { sexual: 0.97 })));
        const out = await screenHumanInput(input);
        expect(out).toEqual({ verdict: 'would_block', reason: 'sexual', mode: 'monitor', blocked: false });

        expect(mockAskJev).toHaveBeenCalledTimes(1);
        const [, , , options] = mockAskJev.mock.calls[0];
        expect(options.timeoutMs).toBe(JEV_SCREEN_CONFIG.TIMEOUT_MS);

        expect(mockRecordScreenSpend).toHaveBeenCalledWith('g1', expect.objectContaining({ inputTokens: 650, costUSD: 0.0000273 }), 'p@example.com', 'jev-1.13.0', 'TYPESAFE_API_KEY');

        expect(mockSaveRecord).toHaveBeenCalledTimes(1);
        const record = mockSaveRecord.mock.calls[0][0];
        expect(record).toMatchObject({
            gameId: 'g1', userEmail: 'p@example.com', source: 'chat', day: 2, text: input.text,
            promptVersion: JEV_SCREEN_PROMPT_VERSION, model: 'jev-1.13.0', verdict: 'would_block', reason: 'sexual',
            mode: 'monitor', enforced: false, thresholds: JEV_SCREEN_CONFIG,
        });
        expect(record.state.text).toBe(input.text);
        expect(record.questions.risk.criteria).toEqual([...JEV_SCREEN_RISK_LEVELS]);
        expect(record.answers.sexual.noul).toBe(0.97);
        expect(record.flags.sexual).toBe(0.97);
        expect(record.riskScore).toBeCloseTo(1.97);

        expect(mockWarn).toHaveBeenCalledWith('Jev screen would_block', expect.objectContaining({ activity: 'jev_screen', reason: 'sexual' }));
        expect(mockAgentActivity).toHaveBeenCalledWith('Content screen', 'jev-1.13.0', 'jev_screen', expect.objectContaining({ gameId: 'g1' }), expect.anything());
    });

    it('enforce mode rejects a would-block verdict with a message and marks the record enforced', async () => {
        mockMode.mockResolvedValue('enforce');
        mockAskJev.mockResolvedValue(jevResult(answers([0, 0.03, 0.97, 0], { sexual: 0.97 })));
        const out = await screenHumanInput(input);
        expect(out.blocked).toBe(true);
        expect(out.message).toBe("This message can't be sent to the AI players because it contains sexual content. Please rephrase it.");
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
    });

    it('a preview has no game: billed without a game id', async () => {
        mockAskJev.mockResolvedValue(jevResult(answers([0.9, 0.1, 0, 0])));
        const out = await screenHumanInput({ source: 'preview', text: 'Theme: a snowed-in mansion', userEmail: 'p@example.com', apiKeys: {} });
        expect(out.verdict).toBe('ok');
        expect(mockRecordScreenSpend.mock.calls[0][0]).toBeUndefined();
        expect(mockSaveRecord.mock.calls[0][0]).toMatchObject({ gameId: null, day: null, source: 'preview' });
    });
});
