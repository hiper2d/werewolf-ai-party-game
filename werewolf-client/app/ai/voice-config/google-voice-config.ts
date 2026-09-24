import { VoiceConfig, VoiceMetadata, VoiceProvider } from './voice-config';

/**
 * Google Gemini TTS Voice Metadata
 *
 * Google provides 30 prebuilt voices for their TTS API.
 * Each voice has a distinct personality and speaking style.
 *
 * Genders follow Google Cloud's Chirp 3 HD voice list, which uses the same
 * 30 voices and does state their gender (the Gemini docs don't):
 * https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
 */
const GOOGLE_VOICES: VoiceMetadata[] = [
  // Voices with official personality descriptors from Google
  {
    id: 'Zephyr',
    gender: 'female',
    description: 'Bright and airy with an optimistic, cheerful quality. Light and refreshing like a gentle breeze. Good for positive characters and messengers of good news.',
    celebrityExamples: [], // TODO: User to provide
  },
  {
    id: 'Puck',
    gender: 'male',
    description: 'Upbeat and mischievous with playful energy. Quick-witted and entertaining. Good for tricksters, jesters, and characters who love chaos.',
    celebrityExamples: [],
    biography: 'Inspired by the mythological trickster, this voice profile was designed to capture the essence of a forest sprite who enjoys leading travelers astray with a laugh.',
  },
  {
    id: 'Charon',
    gender: 'male',
    description: 'Informative and measured with a serious, authoritative quality. Clear and articulate. Good for narrators, Game Masters, and wise guides.',
    celebrityExamples: [],
  },
  {
    id: 'Kore',
    gender: 'female',
    description: 'Firm and resolute with a confident, no-nonsense attitude. Direct and commanding. Good for leaders, warriors, and strong-willed characters.',
    celebrityExamples: [],
  },
  {
    id: 'Fenrir',
    gender: 'male',
    description: 'Excitable and intense with barely contained energy. Wild and unpredictable. Good for aggressive characters, rebels, and those driven by passion.',
    celebrityExamples: [],
  },
  {
    id: 'Leda',
    gender: 'female',
    description: 'Youthful and fresh with innocent charm. Enthusiastic and sincere. Good for young characters, idealists, and those new to the world.',
    celebrityExamples: [],
  },
  {
    id: 'Orus',
    gender: 'male',
    description: 'Firm and steady with unwavering resolve. Stoic and dependable. Good for protectors, guardians, and characters of few words.',
    celebrityExamples: [],
  },
  {
    id: 'Aoede',
    gender: 'female',
    description: 'Breezy and casual with an easygoing charm. Relaxed and approachable. Good for friendly characters and those who put others at ease.',
    celebrityExamples: [],
  },
  {
    id: 'Callirrhoe',
    gender: 'female',
    description: 'Easy-going and flowing with a natural, unhurried quality. Calm and reassuring. Good for peaceful characters and healers.',
    celebrityExamples: [],
  },
  {
    id: 'Autonoe',
    gender: 'female',
    description: 'Bright and alert with keen awareness. Sharp and perceptive. Good for detectives, observers, and characters who notice everything.',
    celebrityExamples: [],
  },
  {
    id: 'Enceladus',
    gender: 'male',
    description: 'Breathy and intimate with a quiet intensity. Mysterious and alluring. Good for seducers, spies, and characters with hidden agendas.',
    celebrityExamples: [],
  },
  {
    id: 'Iapetus',
    gender: 'male',
    description: 'Clear and precise with excellent articulation. Professional and reliable. Good for scholars, doctors, and analytical characters.',
    celebrityExamples: [],
  },
  {
    id: 'Umbriel',
    gender: 'male',
    description: 'Easy-going and laid-back with a chill demeanor. Unflappable and cool. Good for characters who stay calm under pressure.',
    celebrityExamples: [],
  },
  {
    id: 'Algieba',
    gender: 'male',
    description: 'Smooth and polished with sophisticated charm. Elegant and refined. Good for aristocrats, diplomats, and cultured characters.',
    celebrityExamples: [],
  },
  {
    id: 'Despina',
    gender: 'female',
    description: 'Smooth and melodic with graceful delivery. Flowing and pleasant. Good for storytellers and characters with artistic souls.',
    celebrityExamples: [],
  },
  {
    id: 'Erinome',
    gender: 'female',
    description: 'Clear and crystalline with pure, bell-like tones. Honest and transparent. Good for truthful characters and those who speak plainly.',
    celebrityExamples: [],
  },
  {
    id: 'Algenib',
    gender: 'male',
    description: 'Gravelly and rough with a weathered quality. Tough and experienced. Good for veterans, outlaws, and hardened characters.',
    celebrityExamples: [],
  },
  {
    id: 'Rasalgethi',
    gender: 'male',
    description: 'Informative and knowledgeable with depth and wisdom. Thoughtful and considered. Good for mentors, sages, and teachers.',
    celebrityExamples: [],
  },
  {
    id: 'Laomedeia',
    gender: 'female',
    description: 'Upbeat and encouraging with positive energy. Supportive and motivating. Good for cheerleaders, supporters, and optimistic allies.',
    celebrityExamples: [],
  },
  {
    id: 'Achernar',
    gender: 'female',
    description: 'Soft and gentle with a quiet, soothing presence. Tender and compassionate. Good for healers, caregivers, and gentle souls.',
    celebrityExamples: [],
  },
  {
    id: 'Alnilam',
    gender: 'male',
    description: 'Firm and decisive with clear conviction. Strong and unwavering. Good for judges, lawkeepers, and moral authorities.',
    celebrityExamples: [],
  },
  {
    id: 'Schedar',
    gender: 'male',
    description: 'Even and balanced with consistent, steady delivery. Reliable and predictable. Good for diplomats and mediators.',
    celebrityExamples: [],
  },
  {
    id: 'Gacrux',
    gender: 'female',
    description: 'Mature and seasoned with the weight of experience. Wise and weathered. Good for elders, veterans, and characters with long histories.',
    celebrityExamples: [],
  },
  {
    id: 'Pulcherrima',
    gender: 'female',
    description: 'Forward and bold with confident projection. Assertive and commanding. Good for leaders, commanders, and those who take charge.',
    celebrityExamples: [],
  },
  {
    id: 'Achird',
    gender: 'male',
    description: 'Friendly and welcoming with genuine warmth. Approachable and likeable. Good for innkeepers, hosts, and community figures.',
    celebrityExamples: [],
  },
  {
    id: 'Zubenelgenubi',
    gender: 'male',
    description: 'Casual and relaxed with an informal, down-to-earth quality. Unpretentious and real. Good for common folk and everyday characters.',
    celebrityExamples: [],
  },
  {
    id: 'Vindemiatrix',
    gender: 'female',
    description: 'Gentle and kind with nurturing warmth. Caring and patient. Good for mothers, nurses, and protective figures.',
    celebrityExamples: [],
  },
  {
    id: 'Sadachbia',
    gender: 'male',
    description: 'Lively and animated with sparkling energy. Vivacious and engaging. Good for entertainers, socialites, and life-of-the-party types.',
    celebrityExamples: [],
  },
  {
    id: 'Sadaltager',
    gender: 'male',
    description: 'Knowledgeable and learned with scholarly depth. Intellectual and precise. Good for wizards, scholars, and experts.',
    celebrityExamples: [],
  },
  {
    id: 'Sulafat',
    gender: 'female',
    description: 'Warm and comforting with a cozy, reassuring quality. Trustworthy and safe. Good for allies, confidants, and protective friends.',
    celebrityExamples: [],
  },
];

export class GoogleVoiceConfig implements VoiceConfig {
  readonly provider: VoiceProvider = 'google';

  getVoices(): VoiceMetadata[] {
    return [...GOOGLE_VOICES];
  }

  getVoicesByGender(gender: 'male' | 'female'): VoiceMetadata[] {
    return GOOGLE_VOICES.filter((voice) => voice.gender === gender);
  }

  getVoiceById(id: string): VoiceMetadata | undefined {
    return GOOGLE_VOICES.find((voice) => voice.id === id);
  }

  getPromptDescription(): string {
    const maleVoices = this.getVoicesByGender('male');
    const femaleVoices = this.getVoicesByGender('female');

    let description = 'Available Google TTS Voices:\n\n';

    description += 'MALE VOICES:\n';
    maleVoices.forEach((voice) => {
      description += `- ${voice.id}: ${voice.description}`;
      if (voice.celebrityExamples.length > 0) {
        description += ` Similar to: ${voice.celebrityExamples.join(', ')}.`;
      }
      if (voice.biography) {
        description += ` Background: ${voice.biography}`;
      }
      description += '\n';
    });

    description += '\nFEMALE VOICES:\n';
    femaleVoices.forEach((voice) => {
      description += `- ${voice.id}: ${voice.description}`;
      if (voice.celebrityExamples.length > 0) {
        description += ` Similar to: ${voice.celebrityExamples.join(', ')}.`;
      }
      if (voice.biography) {
        description += ` Background: ${voice.biography}`;
      }
      description += '\n';
    });

    return description;
  }
}
