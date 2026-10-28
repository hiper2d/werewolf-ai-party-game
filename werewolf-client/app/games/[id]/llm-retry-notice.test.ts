import { watchLlmRetryNotice, LLM_RETRY_POLL_DELAY_MS, LLM_RETRY_POLL_INTERVAL_MS } from './llm-retry-notice';
import type { LlmRetryNotice } from '@/app/api/game-models';

jest.mock('@/app/api/game-actions', () => ({ getLlmRetryNotice: jest.fn() }));
import { getLlmRetryNotice } from '@/app/api/game-actions';

const poll = getLlmRetryNotice as jest.Mock;
const notice = (attempt = 1): LlmRetryNotice => ({ actor: 'Cora', model: 'deepseek-v4-flash', reason: 'empty', attempt, startedAt: 1_000 });

describe('watchLlmRetryNotice', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        poll.mockReset();
    });
    afterEach(() => jest.useRealTimers());

    it('does not poll before the delay, so a fast turn costs no reads', async () => {
        poll.mockResolvedValue(null);
        const onChange = jest.fn();
        const stop = watchLlmRetryNotice('g1', onChange);
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_DELAY_MS - 1);
        expect(poll).not.toHaveBeenCalled();
        stop();
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_INTERVAL_MS * 3);
        expect(poll).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('reports a notice once when it appears, not on every poll, and null when the action is over', async () => {
        poll.mockResolvedValueOnce(null).mockResolvedValue(notice());
        const onChange = jest.fn();
        const stop = watchLlmRetryNotice('g1', onChange);
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_DELAY_MS);
        expect(poll).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_INTERVAL_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenLastCalledWith(notice());
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_INTERVAL_MS * 2);
        expect(poll).toHaveBeenCalledTimes(4);
        expect(onChange).toHaveBeenCalledTimes(1);
        stop();
        expect(onChange).toHaveBeenLastCalledWith(null);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('a second re-send with a new attempt number is reported as a change', async () => {
        poll.mockResolvedValueOnce(notice(1)).mockResolvedValue(notice(2));
        const onChange = jest.fn();
        const stop = watchLlmRetryNotice('g1', onChange);
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_DELAY_MS + LLM_RETRY_POLL_INTERVAL_MS);
        expect(onChange.mock.calls.map(([n]) => n?.attempt)).toEqual([1, 2]);
        stop();
    });

    it('a failed poll is skipped and polling continues', async () => {
        poll.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(notice());
        const onChange = jest.fn();
        const stop = watchLlmRetryNotice('g1', onChange);
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_DELAY_MS + LLM_RETRY_POLL_INTERVAL_MS);
        expect(poll).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledWith(notice());
        stop();
    });

    it('a result that lands after stop is dropped', async () => {
        let resolve: (n: LlmRetryNotice | null) => void = () => {};
        poll.mockImplementation(() => new Promise(r => { resolve = r; }));
        const onChange = jest.fn();
        const stop = watchLlmRetryNotice('g1', onChange);
        await jest.advanceTimersByTimeAsync(LLM_RETRY_POLL_DELAY_MS);
        stop();
        resolve(notice());
        await Promise.resolve();
        expect(onChange).not.toHaveBeenCalled();
    });
});
