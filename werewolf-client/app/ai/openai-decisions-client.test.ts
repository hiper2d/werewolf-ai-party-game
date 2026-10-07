/**
 * The Decisions client speaks Jev's shapes on both sides so the speaker router can run on it
 * unchanged: Jev questions out, Jev answers back (probabilities keyed by value / level index).
 */
import { askOpenAiDecisions, OpenAiDecisionsError, openAiDecisionsCostUSD } from '@/app/ai/openai-decisions-client';
import type { JevChoiceQuestion, JevNoulQuestion, JevScoreQuestion } from '@/app/ai/jev-client';

const questions = {
    dramatic: { type: 'noul', instructions: 'Is it dramatic?', criteria: { true: 'a confrontation' } } as JevNoulQuestion,
    quiet_pick: { type: 'choice', instructions: 'Who is relevant?', criteria: { Ivo: null, Mara: 'the silent one' } } as JevChoiceQuestion,
    reply_Ivo: { type: 'score', instructions: 'Should Ivo reply?', criteria: ['no', 'maybe', 'yes', 'must'] } as JevScoreQuestion,
};

const okBody = {
    model: 'gpt-6-luna',
    answers: [
        { type: 'predicate', name: 'dramatic', probability: 0.16 },
        { type: 'choice', name: 'quiet_pick', choice: 'Ivo', probabilities: [{ value: 'Ivo', probability: 0.9 }, { value: 'Mara', probability: 0.1 }], confidence: 0.8 },
        { type: 'score', name: 'reply_Ivo', score: 2.6, probabilities: [
            { value: 0, label: '0', probability: 0 }, { value: 1, label: '1', probability: 0.01 },
            { value: 2, label: '2', probability: 0.38 }, { value: 3, label: '3', probability: 0.61 },
        ], confidence: 0.6 },
    ],
    usage: { input_tokens: 459, output_tokens: 0 },
};

function mockFetch(status: number, body: unknown) {
    const fetchMock = jest.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));
    (global as any).fetch = fetchMock;
    return fetchMock;
}

describe('askOpenAiDecisions', () => {
    it('sends Jev questions as Decisions questions', async () => {
        const fetchMock = mockFetch(200, okBody);
        await askOpenAiDecisions('sk', { discussion: ['Tom: hi'] }, questions);
        const [url, init] = fetchMock.mock.calls[0] as any;
        expect(url).toBe('https://api.openai.com/v1/decisions');
        expect(init.headers.Authorization).toBe('Bearer sk');
        const sent = JSON.parse(init.body);
        expect(sent.model).toBe('gpt-6-luna');
        expect(sent.input).toBe('{"discussion":["Tom: hi"]}');
        expect(sent.questions).toEqual([
            { type: 'predicate', name: 'dramatic', instructions: 'Is it dramatic?\nTrue means: a confrontation' },
            { type: 'choice', name: 'quiet_pick', instructions: 'Who is relevant?', choices: [{ value: 'Ivo' }, { value: 'Mara', description: 'the silent one' }] },
            { type: 'score', name: 'reply_Ivo', instructions: 'Should Ivo reply?', levels: [
                { label: '0', description: 'no' }, { label: '1', description: 'maybe' },
                { label: '2', description: 'yes' }, { label: '3', description: 'must' },
            ] },
        ]);
    });

    it('returns Jev-shaped answers and input-only cost', async () => {
        mockFetch(200, okBody);
        const result = await askOpenAiDecisions('sk', 'state', questions);
        expect(result.answers.dramatic).toEqual({ noul: 0.16 });
        expect(result.answers.quiet_pick).toEqual({ choice: 'Ivo', probabilities: { Ivo: 0.9, Mara: 0.1 }, confidence: 0.8 });
        expect(result.answers.reply_Ivo).toEqual({ score: 2.6, legend: '3', probabilities: { '0': 0, '1': 0.01, '2': 0.38, '3': 0.61 }, confidence: 0.6 });
        expect(result.inputTokens).toBe(459);
        expect(result.costUSD).toBe(openAiDecisionsCostUSD(459));
        expect(openAiDecisionsCostUSD(1_000_000)).toBe(0.1);
    });

    it('fails the call on a refusal or a missing answer', async () => {
        mockFetch(200, { ...okBody, answers: [{ type: 'refusal', name: 'dramatic' }, ...okBody.answers.slice(1)] });
        await expect(askOpenAiDecisions('sk', 'state', questions)).rejects.toThrow('OpenAI Decisions refused: dramatic');
        mockFetch(200, { ...okBody, answers: okBody.answers.slice(0, 2) });
        await expect(askOpenAiDecisions('sk', 'state', questions)).rejects.toThrow('missing answers: reply_Ivo');
    });

    it('carries the HTTP status and body on an API error', async () => {
        mockFetch(429, { error: { message: 'rate limited' } });
        const error = await askOpenAiDecisions('sk', 'state', questions).catch(e => e);
        expect(error).toBeInstanceOf(OpenAiDecisionsError);
        expect(error.status).toBe(429);
        expect(error.body).toContain('rate limited');
    });
});
