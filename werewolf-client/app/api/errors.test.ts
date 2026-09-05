import { isInsufficientBalanceError, isProviderBudgetDepletedError, isProviderBusyError } from './errors';

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
