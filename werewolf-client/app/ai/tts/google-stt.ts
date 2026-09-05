import { GoogleGenAI } from "@google/genai";
import { AUDIO_MODEL_CONSTANTS } from "@/app/ai/ai-models";

export interface GoogleSttOptions {
  mimeType?: string;   // container of the recording; the browser records audio/webm
}

export interface GoogleSttResult {
  text: string;
  durationSeconds: number; // derived from audio tokens (~25/s) — Gemini reports no duration
  usage: { inputTokens: number; outputTokens: number }; // audio tokens in, text tokens out
}

// From the pricing page footnote: 25 audio tokens per second of input.
export const GEMINI_AUDIO_TOKENS_PER_SECOND = 25;

/**
 * Core Gemini transcription call: audio + API key in, transcript + usage out.
 * No auth, tier, or cost logic — that lives in app/api/stt-actions.ts.
 *
 * Uses the Interactions API: with this model, generateContent returns the
 * transcript as a non-text part the SDK can't surface (verified 2026-09-05).
 */
export async function transcribeWithGemini(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  options: GoogleSttOptions = {}
): Promise<GoogleSttResult> {
  const client = new GoogleGenAI({ apiKey });
  const interaction: any = await client.interactions.create({
    model: AUDIO_MODEL_CONSTANTS.GOOGLE_STT,
    input: [{ type: 'audio', data: Buffer.from(audioBuffer).toString('base64'), mime_type: options.mimeType || 'audio/webm' }],
  } as any);

  const text = typeof interaction?.output_text === 'string' ? interaction.output_text.trim() : '';
  const usage = interaction?.usage ?? {};
  const byModality = (rows: any[] | undefined, modality: string): number =>
    (rows ?? []).filter(r => r?.modality === modality).reduce((sum, r) => sum + (Number(r?.tokens) || 0), 0);
  const inputTokens: number = byModality(usage.input_tokens_by_modality, 'audio') || usage.total_input_tokens || 0;
  // The top-level output count has been observed as 0 while the per-invocation
  // breakdown carried the transcript tokens; read both, then fall back to an
  // estimate from the text so a transcript is never billed as free.
  const invocationOutput: number = (usage.model_invocation_token_counts ?? [])
    .reduce((sum: number, inv: any) => sum + (inv?.candidates_tokens_details ?? []).reduce((s: number, d: any) => s + (Number(d?.tokens) || 0), 0), 0);
  const outputTokens: number = usage.total_output_tokens || invocationOutput || Math.ceil(text.length / 4);

  return { text, durationSeconds: inputTokens / GEMINI_AUDIO_TOKENS_PER_SECOND, usage: { inputTokens, outputTokens } };
}
