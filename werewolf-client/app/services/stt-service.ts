import { transcribeAudio } from "@/app/api/stt-actions";
import { VoiceProvider } from "@/app/ai/voice-config/voice-config";
import { MAX_STT_RECORDING_MS } from "@/app/utils/input-limits";

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  gameId?: string;
  voiceProvider?: VoiceProvider; // the game's voice set picks the transcription model
}

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
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm'
      });

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
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Recording not started'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
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
      return await transcribeAudio(audioBuffer, { ...options, mimeType: audioBlob.type || 'audio/webm' });
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
