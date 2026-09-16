import { transcribeAudioAction } from "@/app/api/stt-actions";
import { VoiceProvider } from "@/app/ai/voice-config/voice-config";
import { MAX_STT_RECORDING_MS } from "@/app/utils/input-limits";

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  gameId?: string;
  voiceProvider?: VoiceProvider; // the game's voice set picks the transcription model
}

/** Upper bound on one transcription round-trip (a 60s clip transcribes in a few seconds). */
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export class STTService {
  private static instance: STTService | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): STTService {
    if (!STTService.instance) {
      STTService.instance = new STTService();
    }
    return STTService.instance;
  }

  /**
   * Starts recording. A dictation is capped at MAX_STT_RECORDING_MS: when the
   * cap is hit, `onLimitReached` fires so the caller can run its normal stop
   * path (which transcribes what was captured) instead of the clip growing —
   * and being billed — without bound.
   */
  async startRecording(onLimitReached?: () => void): Promise<void> {
    // A second start while one recording runs would replace the recorder and leak
    // the first stream: the microphone stays open with nothing left to stop it.
    if (this.isRecording()) {
      return;
    }
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Create MediaRecorder. Safari has no webm; fall back to what the browser
      // offers rather than failing after the microphone was already opened.
      const mimeType = STTService.pickMimeType();
      // Speech-grade bitrate: at the browser default (~128 kbps) a 45 s clip measured
      // 798 KB, so a full 60 s dictation would exceed the 1 MB server-action body
      // limit and be rejected before the action runs. 32 kbps Opus keeps a capped
      // clip near 240 KB.
      this.mediaRecorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });

      this.audioChunks = [];

      // Collect audio data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start();

      this.limitTimer = setTimeout(() => {
        this.limitTimer = null;
        if (this.mediaRecorder?.state === 'recording') {
          onLimitReached?.();
        }
      }, MAX_STT_RECORDING_MS);
    } catch (error) {
      console.error('Failed to start recording:', error);
      // Whatever failed, do not leave the microphone open.
      this.cleanup();
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  private static pickMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }
    return ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Recording not started'));
        return;
      }

      const type = this.mediaRecorder.mimeType || 'audio/webm';
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  async transcribeRecording(
    audioBlob: Blob,
    options: STTOptions = {}
  ): Promise<string> {
    try {
      const audioBuffer = await audioBlob.arrayBuffer();
      // The action reports failure as a value (a thrown error loses its message in
      // production); rethrow so the catch below keeps its wording.
      // Bounded wait: a request that never settles must not leave the chat stuck
      // on the transcribing spinner with no way out.
      const result = await Promise.race([
        transcribeAudioAction(audioBuffer, { ...options, mimeType: audioBlob.type || 'audio/webm' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer from the transcription service within ${TRANSCRIBE_TIMEOUT_MS / 1000}s. Please try again.`)), TRANSCRIBE_TIMEOUT_MS)),
      ]);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.text;
    } catch (error) {
      console.error('STT Error:', error);
      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.limitTimer) {
      clearTimeout(this.limitTimer);
      this.limitTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}

export const sttService = STTService.getInstance();
