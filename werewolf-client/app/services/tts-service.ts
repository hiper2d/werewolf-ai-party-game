import { generateSpeech } from "@/app/api/tts-actions";

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
}

export class TTSService {
  private static instance: TTSService | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  async speakText(
    text: string, 
    options: TTSOptions = {}
  ): Promise<void> {
    // Stop any currently playing audio
    this.stopSpeaking();

    if (!text.trim()) {
      throw new Error('Text cannot be empty');
    }

    try {
      // Call server action to generate speech
      const audioBuffer = await generateSpeech(text, options);
      
      // Convert ArrayBuffer to Blob
      const audioBlob = new Blob([audioBuffer], { 
        type: 'audio/mpeg' 
      });
      
      // Create audio URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      
      // Clean up URL when audio ends
      this.currentAudio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      });

      // Clean up URL on error
      this.currentAudio.addEventListener('error', () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      });

      await this.currentAudio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  stopSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  isSpeaking(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }
}

export const ttsService = TTSService.getInstance();