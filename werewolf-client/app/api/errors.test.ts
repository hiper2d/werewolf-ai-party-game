import { isInsufficientBalanceError, isModelRefusalError, isProviderBudgetDepletedError, isProviderBusyError, FreeSpendLimitError, freeSpendLimitMessage, freeSpendLimitScope, freeSpendLimitWindow, isFreeSpendLimitError, modelRefusalReason, refusalOf } from './errors';
import { BotResponseError, ModelRefusalError } from '@hiper2d/ai-agents';

describe('isProviderBudgetDepletedError', () => {
    const depletedSamples = [
        // OpenAI, observed 2026-09-05 (preview casting failed on an empty org balance)
        'Failed to get response from OpenAI API: 429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
        'Failed to get response from OpenAI API: 429 You exceeded your current quota, please check your plan and billing details. insufficient_quota',
        // Anthropic
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
        // DeepSeek
        'Failed to get response from DeepSeek API: 402 Insufficient Balance',
        // xAI
        'Failed to get response from Grok API: 403 "Your team has either used all available credits or reached its monthly spending limit."',
    ];

    it.each(depletedSamples)('detects an exhausted platform budget: %s', (msg) => {
        expect(isProviderBudgetDepletedError(msg)).toBe(true);
    });

    it('does not fire on ordinary throttling, the player\'s own prepaid balance, or empty input', () => {
        expect(isProviderBudgetDepletedError('Failed to get response from OpenAI API: 429 Too Many Requests')).toBe(false);
        expect(isProviderBudgetDepletedError('Failed to get response from Google API: got status: 429. RESOURCE_EXHAUSTED: Quota exceeded for quota metric')).toBe(false);
        expect(isProviderBudgetDepletedError('Insufficient balance. Please add funds on your profile page to continue playing.')).toBe(false);
        expect(isProviderBudgetDepletedError(undefined)).toBe(false);
        expect(isProviderBudgetDepletedError('')).toBe(false);
    });
});

describe('isProviderBusyError', () => {
    // Real messages observed in production / agent code paths.
    const busySamples = [
        // xAI (grok-agent wraps the raw status text into the message)
        'Failed to get response from Grok API: 429 "The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing: https://docs.x.ai/developers/advanced-api-usage/priority-processing"',
        // Anthropic puts status text in details, message stays generic
        '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
        'rate_limit_error: Number of request tokens has exceeded your per-minute rate limit',
        // OpenAI-style
        'Failed to get response from OpenAI API: 429 Too Many Requests',
        'Rate limit reached for gpt-5.6 in organization org-x on tokens per min',
        // Google
        'Failed to get response from Google API: got status: 429. RESOURCE_EXHAUSTED: Quota exceeded for quota metric',
    ];

    it.each(busySamples)('detects provider throttling: %s', (msg) => {
        expect(isProviderBusyError(msg)).toBe(true);
    });

    const notBusySamples = [
        'Failed to parse JSON response: Unexpected token < in JSON at position 0',
        'Failed to get response from Mistral API: 401 Unauthorized',
        'Response validation failed: target is not one of the allowed options',
        'Failed to get response from DeepSeek API: fetch failed',
        // Bare numbers inside larger tokens must not match the 429/529 checks
        'Request id 14290529 failed with an unknown error',
    ];

    it.each(notBusySamples)('ignores unrelated failures: %s', (msg) => {
        expect(isProviderBusyError(msg)).toBe(false);
    });

    it('handles empty input', () => {
        expect(isProviderBusyError(undefined)).toBe(false);
        expect(isProviderBusyError(null)).toBe(false);
        expect(isProviderBusyError('')).toBe(false);
    });
});

describe('isInsufficientBalanceError', () => {
    it('matches the shared prepaid-balance refusal wording from every paid call site', () => {
        expect(isInsufficientBalanceError('Insufficient balance. Please add funds on your profile page to continue playing.')).toBe(true);
        expect(isInsufficientBalanceError('Error: Insufficient balance. Please add funds on your profile page to draw illustrations.\n    at commitUsageAtomically')).toBe(true);
    });

    it('ignores provider and parsing failures, and empty input', () => {
        expect(isInsufficientBalanceError('Failed to get response from OpenAI API: 429 Too Many Requests')).toBe(false);
        expect(isInsufficientBalanceError('Failed to parse JSON response')).toBe(false);
        expect(isInsufficientBalanceError(undefined)).toBe(false);
        expect(isInsufficientBalanceError('')).toBe(false);
    });
});

describe('free spend limit errors', () => {
    const dayVerdict = { allowed: false, window: 'day' as const, limitUSD: 5, spentUSD: 5, remainingUSD: 0, resetsAt: Date.UTC(2026, 8, 12) };
    const monthVerdict = { ...dayVerdict, window: 'month' as const, limitUSD: 20, spentUSD: 20, resetsAt: Date.UTC(2026, 9, 1) };

    it('words the daily and monthly refusals with the configured amount', () => {
        expect(freeSpendLimitMessage(dayVerdict)).toBe("You've used today's free $5 of AI. Come back after midnight UTC, or add funds on your profile page to keep playing now.");
        expect(freeSpendLimitMessage(monthVerdict)).toBe("You've used this month's free $20 of AI. It resets on the 1st, or add funds on your profile page to keep playing now.");
        expect(freeSpendLimitMessage({ window: 'day', limitUSD: 2.5 })).toContain("today's free $2.50 of AI");
    });

    it('the error carries the verdict and a stable code', () => {
        const error = new FreeSpendLimitError(dayVerdict);
        expect(error.code).toBe('FREE_SPEND_LIMIT');
        expect(error.verdict).toBe(dayVerdict);
        expect(error.name).toBe('FreeSpendLimitError');
        expect(isFreeSpendLimitError(error.message)).toBe(true);
    });

    it('is recognized after the string round trip, including when wrapped by a caller', () => {
        expect(isFreeSpendLimitError(`Failed to generate speech: ${freeSpendLimitMessage(dayVerdict)}`)).toBe(true);
        expect(freeSpendLimitWindow(freeSpendLimitMessage(dayVerdict))).toBe('day');
        expect(freeSpendLimitWindow(freeSpendLimitMessage(monthVerdict))).toBe('month');
    });

    it('does not fire on provider budget, prepaid balance, or the games-per-day message', () => {
        expect(isFreeSpendLimitError('Insufficient balance. Please add funds on your profile page.')).toBe(false);
        expect(isFreeSpendLimitError('Free tier limit reached: you can create up to 5 games per day.')).toBe(false);
        expect(isFreeSpendLimitError('429 You have no credits remaining')).toBe(false);
        expect(isFreeSpendLimitError('')).toBe(false);
        expect(freeSpendLimitWindow(undefined)).toBeUndefined();
    });
});

describe('scoped spend limit refusals', () => {
    const day = { window: 'day' as const, limitUSD: 5 };
    const month = { window: 'month' as const, limitUSD: 20 };
    const global = { window: 'day' as const, limitUSD: 40 };

    it('shows the device ceilings as an ordinary daily limit, leaking no axis', () => {
        // THE POINT: copy that named the browser would tell a farmer which axis to change
        // ("use a different browser"). Both device ceilings must be indistinguishable from
        // the player's own daily cap. If someone reworded them, this fails.
        const accountDay = freeSpendLimitMessage(day, 'account');
        expect(freeSpendLimitMessage(day, 'device')).toBe(accountDay);
        expect(freeSpendLimitMessage(day, 'device-shared')).toBe(accountDay);
        for (const scope of ['account', 'device', 'device-shared'] as const) {
            expect(freeSpendLimitMessage(day, scope)).not.toMatch(/browser|device|another account|incognito/i);
        }
    });

    it('the player-visible scope is only account or global', () => {
        expect(freeSpendLimitScope(freeSpendLimitMessage(day, 'account'))).toBe('account');
        expect(freeSpendLimitScope(freeSpendLimitMessage(month, 'account'))).toBe('account');
        expect(freeSpendLimitScope(freeSpendLimitMessage(day, 'device'))).toBe('account');
        expect(freeSpendLimitScope(freeSpendLimitMessage(day, 'device-shared'))).toBe('account');
        expect(freeSpendLimitScope(freeSpendLimitMessage(global, 'global'))).toBe('global');
    });

    it('the server still knows which ceiling refused, even though the player does not', () => {
        // The distinction moved to the log, it was not deleted: ops needs it to tell a
        // farm from an ordinary cap hit.
        expect(new FreeSpendLimitError(day as any, 'device-shared').scope).toBe('device-shared');
        expect(new FreeSpendLimitError(day as any, 'device').scope).toBe('device');
    });

    it('every scope is still recognised as a spend-limit refusal', () => {
        for (const scope of ['account', 'device', 'device-shared', 'global'] as const) {
            expect(isFreeSpendLimitError(freeSpendLimitMessage(day, scope))).toBe(true);
        }
    });

    it('survives being wrapped in another error prefix', () => {
        const wrapped = `Failed to generate speech: ${freeSpendLimitMessage(global, 'global')}`;
        expect(isFreeSpendLimitError(wrapped)).toBe(true);
        expect(freeSpendLimitScope(wrapped)).toBe('global');
        expect(freeSpendLimitWindow(wrapped)).toBe('day');
    });

    it('the global refusal never quotes the platform budget to the player', () => {
        const msg = freeSpendLimitMessage(global, 'global');
        expect(msg).not.toContain('$40');
        expect(msg).toMatch(/paused for today/i);
    });

    it('no refusal ever accuses the player of anything', () => {
        for (const scope of ['account', 'device', 'device-shared', 'global'] as const) {
            expect(freeSpendLimitMessage(day, scope)).not.toMatch(/abuse|cheat|bypass|violat|fraud/i);
        }
    });

    it('a non-refusal has no scope', () => {
        expect(freeSpendLimitScope('Insufficient balance.')).toBeUndefined();
        expect(freeSpendLimitScope(undefined)).toBeUndefined();
    });

    it('carries the scope on the thrown error', () => {
        expect(new FreeSpendLimitError(global as any, 'global').scope).toBe('global');
        expect(new FreeSpendLimitError(day as any).scope).toBe('account');
    });
});

describe('model refusal detection', () => {
    // Exact production message of 2026-09-13 (Gemini 3.8 Flash, explicit roleplay game).
    const gemini = 'gemini-3.8-flash refused the prompt (blockReason: PROHIBITED_CONTENT)';
    const geminiCandidate = 'gemini-3.1-pro-preview refused to answer (finishReason: SAFETY; safetyRatings: HARM_CATEGORY_SEXUALLY_EXPLICIT=HIGH)';
    const anthropic = 'claude-fable-5-1 refused to answer (stop_reason: refusal)';
    const qwen = 'qwen-flash refused the prompt (refusalReason: DataInspectionFailed; Input text data may contain inappropriate content.)';

    it.each([gemini, geminiCandidate, anthropic, qwen])('recognizes the library wording: %s', (msg) => {
        expect(isModelRefusalError(msg)).toBe(true);
    });

    it('extracts the provider label', () => {
        expect(modelRefusalReason(gemini)).toBe('PROHIBITED_CONTENT');
        expect(modelRefusalReason(geminiCandidate)).toBe('SAFETY');
        expect(modelRefusalReason(anthropic)).toBe('refusal');
        expect(modelRefusalReason(qwen)).toBe('DataInspectionFailed');
    });

    it('does not fire on ordinary failures, an old-style empty response, or empty input', () => {
        expect(isModelRefusalError('Empty response from Google API (finishReason=STOP)')).toBe(false);
        expect(isModelRefusalError('Failed to get response from Qwen API: 400 InternalError.Algo.DataInspectionFailed: Input text data may contain inappropriate content.')).toBe(false);
        expect(isModelRefusalError('Invalid vote target: Tom')).toBe(false);
        expect(isModelRefusalError(undefined)).toBe(false);
        expect(modelRefusalReason('')).toBeUndefined();
    });

    it('refusalOf sees the typed error, the vote path\'s BotResponseError wrapper, and a plain Error', () => {
        expect(refusalOf(new ModelRefusalError('gemini-3.8-flash', gemini, 'PROHIBITED_CONTENT'))).toEqual({ reason: 'PROHIBITED_CONTENT' });
        expect(refusalOf(new BotResponseError(gemini, 'Bot Marina (gemini-flash) encountered an error during voting', { originalError: 'ModelRefusalError' }, true))).toEqual({ reason: 'PROHIBITED_CONTENT' });
        expect(refusalOf(new Error(anthropic))).toEqual({ reason: 'refusal' });
        expect(refusalOf(new Error('Empty response from Google API'))).toBeUndefined();
        expect(refusalOf(null)).toBeUndefined();
    });
});
