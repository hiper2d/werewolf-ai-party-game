import { buildGoogleTtsPrompt } from "./google-tts";
import { calculateGoogleTtsCost } from "@/app/utils/pricing";

describe('buildGoogleTtsPrompt', () => {
  const line = 'The werewolf hides among the villagers.';

  it('returns the line untouched without a style', () => {
    expect(buildGoogleTtsPrompt(line)).toBe(line);
    expect(buildGoogleTtsPrompt(line, '   ')).toBe(line);
  });

  it('turns the short story-generator style into the documented "Say X:" prefix', () => {
    expect(buildGoogleTtsPrompt(line, 'mysteriously')).toBe(`Say mysteriously: ${line}`);
    expect(buildGoogleTtsPrompt(line, 'warmly and slowly')).toBe(`Say warmly and slowly: ${line}`);
  });

  it('uses a longer direction as written, separated from the line by a colon', () => {
    const direction = 'Speak like a tired old sailor, slow and gravelly.';
    expect(buildGoogleTtsPrompt(line, direction)).toBe(`Speak like a tired old sailor, slow and gravelly:\n${line}`);
  });

  it('does not double the colon when the direction already ends with one', () => {
    expect(buildGoogleTtsPrompt(line, 'Whisper this:')).toBe(`Say Whisper this: ${line}`);
  });
});

describe('calculateGoogleTtsCost', () => {
  it('prices text input and audio output tokens at their own rates', () => {
    // $1/M text in + $20/M audio out
    expect(calculateGoogleTtsCost({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1, 10);
    expect(calculateGoogleTtsCost({ inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(20, 10);
    expect(calculateGoogleTtsCost({ inputTokens: 18, outputTokens: 285 })).toBeCloseTo(0.000018 + 0.0057, 10);
  });

  it('never goes negative on bad usage', () => {
    expect(calculateGoogleTtsCost({ inputTokens: -5, outputTokens: NaN })).toBe(0);
  });
});
