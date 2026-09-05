import { VoiceProvider } from "@/app/ai/voice-config";

/**
 * Voice agents: one per provider, chosen through the factory the way text
 * agents are — a caller asks for a provider and gets speak()/transcribe()
 * without knowing which SDK or model is behind them. Cores stay pure (no auth,
 * tier, or billing): an agent returns what it produced plus the cost of doing
 * so, and the server actions decide whom to bill. Shaped to move into
 * @hiper2d/ai-agents unchanged.
 */

export interface SpeechRequest {
  text: string;
  voice: string;          // an id of this provider's voice set
  voiceStyle?: string;    // delivery direction ("mysteriously", or a longer sentence)
}

export interface SpeechResult {
  audio: ArrayBuffer;     // WAV
  costUSD: number;
  // What the provider billed for: characters (OpenAI) or tokens (Gemini).
  usage: { characters?: number; inputTokens?: number; outputTokens?: number };
}

export interface TranscriptionRequest {
  audio: ArrayBuffer;
  mimeType?: string;
  fileName?: string;
  language?: string;
  prompt?: string;
}

export interface TranscriptionResult {
  text: string;
  durationSeconds: number;
  costUSD: number;
  usage: { audioSeconds?: number; inputTokens?: number; outputTokens?: number };
}

export interface VoiceAgent {
  readonly provider: VoiceProvider;
  readonly ttsModel: string;
  readonly sttModel: string;
  speak(request: SpeechRequest): Promise<SpeechResult>;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
