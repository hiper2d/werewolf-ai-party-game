import { generateSpeechWithProvider } from "@/app/api/tts-actions";
import { VoiceProvider } from "@/app/ai/voice-config/voice-config";
import { getDefaultVoiceProvider } from "@/app/ai/voice-config";

export interface TTSOptions {
  voice: string;                  // Voice ID (e.g., "echo", "Kore")
  voiceStyle?: string;            // Style instruction (e.g., "mysteriously", "excitedly")
  voiceProvider?: VoiceProvider;  // TTS provider (defaults to user's preference)
  gameId?: string;
}

export class TTSService {
  private static instance: TTSService | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private currentAudioKey: string | null = null;
  private currentAudioCleanup: (() => void) | null = null;
  private readonly audioCache = new Map<string, ArrayBuffer>();
  private readonly pendingRequests = new Map<string, Promise<ArrayBuffer>>();
  private readonly maxCacheEntries = 50;
  private playRequestId = 0;

  static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  async speakText(
    text: string,
    options: TTSOptions
  ): Promise<void> {
    const sanitizedText = text.trim();
    if (!sanitizedText) {
      throw new Error('Text cannot be empty');
    }

    // Increment request id so only the latest invocation continues to playback
    this.playRequestId += 1;
    const requestId = this.playRequestId;
    const cacheKey = this.getCacheKey(sanitizedText, options);

    // Stop any existing playback so we never layer the same sound
    this.stopSpeaking();

    try {
      const audioBuffer = await this.getAudioBuffer(cacheKey, sanitizedText, options);

      // Another request superseded this one while loading
      if (this.playRequestId !== requestId) {
        return;
      }

      // Both providers return WAV format
      const mimeType = 'audio/wav';
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioElement = new Audio(audioUrl);

      const cleanup = () => {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement.removeEventListener('ended', onEnded);
        audioElement.removeEventListener('error', onError);
        if (this.currentAudio === audioElement) {
          this.currentAudio = null;
          this.currentAudioKey = null;
        }
        if (this.currentAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          this.currentAudioUrl = null;
        }
        if (this.currentAudioCleanup === cleanup) {
          this.currentAudioCleanup = null;
        }
      };

      const onEnded = () => cleanup();
      const onError = () => cleanup();

      audioElement.addEventListener('ended', onEnded);
      audioElement.addEventListener('error', onError);

      this.currentAudio = audioElement;
      this.currentAudioKey = cacheKey;
      this.currentAudioUrl = audioUrl;
      this.currentAudioCleanup = cleanup;

      await audioElement.play();
    } catch (error) {
      if (this.playRequestId === requestId) {
        this.stopSpeaking();
      }
      console.error('TTS Error:', error);
      throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  stopSpeaking(): void {
    if (this.currentAudioCleanup) {
      this.currentAudioCleanup();
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    this.currentAudioKey = null;
  }

  pauseSpeaking(): void {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  resumeSpeaking(): void {
    if (this.currentAudio && this.currentAudio.paused && this.currentAudio.currentTime > 0) {
      this.currentAudio.play();
    }
  }

  isSpeaking(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }

  isPaused(): boolean {
    return this.currentAudio !== null && this.currentAudio.paused && this.currentAudio.currentTime > 0;
  }

  hasActiveAudio(): boolean {
    return this.currentAudio !== null;
  }

  private getCacheKey(text: string, options: TTSOptions): string {
    const normalizedOptions = {
      voice: options.voice,
      voiceStyle: options.voiceStyle || '',
      voiceProvider: options.voiceProvider || getDefaultVoiceProvider(),
      gameId: options.gameId || ''
    };
    return JSON.stringify({ text, ...normalizedOptions });
  }

  private async getAudioBuffer(
    cacheKey: string,
    text: string,
    options: TTSOptions
  ): Promise<ArrayBuffer> {
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey)!;
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    const voiceProvider = options.voiceProvider || getDefaultVoiceProvider();
    const requestPromise = generateSpeechWithProvider(
      text,
      {
        voice: options.voice,
        voiceStyle: options.voiceStyle,
        gameId: options.gameId
      },
      voiceProvider
    )
      .then(buffer => {
        this.pendingRequests.delete(cacheKey);
        this.addToCache(cacheKey, buffer);
        return buffer;
      })
      .catch(error => {
        this.pendingRequests.delete(cacheKey);
        throw error;
      });

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  private addToCache(key: string, buffer: ArrayBuffer): void {
    if (this.audioCache.size >= this.maxCacheEntries) {
      const oldestEntry = this.audioCache.keys().next().value;
      if (oldestEntry !== undefined) {
        this.audioCache.delete(oldestEntry);
      }
    }
    this.audioCache.set(key, buffer);
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'opus':
        return 'audio/opus';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'pcm':
        return 'audio/pcm';
      default:
        return 'audio/wav'; // Default to WAV
    }
  }
}

export const ttsService = TTSService.getInstance();
