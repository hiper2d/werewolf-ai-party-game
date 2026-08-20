import { isProviderBusyError } from './errors';

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
