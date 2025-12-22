import { VoiceConfig, VoiceMetadata, VoiceProvider } from './voice-config';

/**
 * OpenAI TTS Voice Metadata
 *
 * OpenAI provides 10 voices for their TTS API:
 * - Male: echo, fable, onyx, ash, ballad
 * - Female: alloy, nova, shimmer, coral, sage
 */
const OPENAI_VOICES: VoiceMetadata[] = [
  // Male voices
  {
    id: 'echo',
    gender: 'male',
    description: 'Warm, conversational, and approachable. A friendly everyman voice with a natural, easygoing quality. Good for trustworthy characters, allies, and relatable protagonists.',
    celebrityExamples: ['Chris Pratt', 'Paul Rudd'],
  },
  {
    id: 'fable',
    gender: 'male',
    description: 'Expressive and dramatic with a storyteller quality. Slightly theatrical with good range for emotional delivery. Good for narrators, wise characters, or those with secrets.',
    celebrityExamples: ['Benedict Cumberbatch', 'Tom Hiddleston'],
  },
  {
    id: 'onyx',
    gender: 'male',
    description: 'Deep, authoritative, and commanding. A powerful bass voice that projects confidence and gravitas. Good for leaders, villains, or intimidating characters.',
    celebrityExamples: ['James Earl Jones', 'Idris Elba'],
    biography: 'Onyx is a seasoned voice actor who specialized in Shakespearean theater before moving into film narration. His voice carries the weight of years on the stage.',
  },
  {
    id: 'ash',
    gender: 'male',
    description: 'Smooth and measured with a calm, collected demeanor. Professional and articulate. Good for intelligent characters, strategists, or composed individuals.',
    celebrityExamples: ['Morgan Freeman', 'Sam Elliott'],
  },
  {
    id: 'ballad',
    gender: 'male',
    description: 'Youthful and energetic with a slightly rough edge. Enthusiastic and dynamic. Good for young characters, rebels, or those full of passion.',
    celebrityExamples: ['Tom Holland', 'Timothée Chalamet'],
  },

  // Female voices
  {
    id: 'alloy',
    gender: 'female',
    description: 'Versatile and balanced with a neutral, pleasant quality. Clear and articulate without being too distinctive. Good for everyday characters or when neutrality is needed.',
    celebrityExamples: ['Scarlett Johansson', 'Emma Stone'],
  },
  {
    id: 'nova',
    gender: 'female',
    description: 'Bright, energetic, and youthful. Optimistic and engaging with natural enthusiasm. Good for upbeat characters, helpers, or friendly personalities.',
    celebrityExamples: ['Anna Kendrick', 'Zendaya'],
  },
  {
    id: 'shimmer',
    gender: 'female',
    description: 'Soft, gentle, and ethereal. A dreamy quality with a soothing presence. Good for mysterious characters, seers, or those with hidden depths.',
    celebrityExamples: ['Cate Blanchett', 'Tilda Swinton'],
  },
  {
    id: 'coral',
    gender: 'female',
    description: 'Warm and nurturing with a mature, caring quality. Comforting and trustworthy. Good for protective characters, mentors, or maternal figures.',
    celebrityExamples: ['Viola Davis', 'Octavia Spencer'],
  },
  {
    id: 'sage',
    gender: 'female',
    description: 'Confident and assertive with a sharp, intelligent edge. Direct and no-nonsense. Good for leaders, detectives, or strong-willed characters.',
    celebrityExamples: ['Helen Mirren', 'Judi Dench'],
  },
];

export class OpenAIVoiceConfig implements VoiceConfig {
  readonly provider: VoiceProvider = 'openai';

  getVoices(): VoiceMetadata[] {
    return [...OPENAI_VOICES];
  }

  getVoicesByGender(gender: 'male' | 'female'): VoiceMetadata[] {
    return OPENAI_VOICES.filter((voice) => voice.gender === gender);
  }

  getVoiceById(id: string): VoiceMetadata | undefined {
    return OPENAI_VOICES.find((voice) => voice.id === id);
  }

  getPromptDescription(): string {
    const maleVoices = this.getVoicesByGender('male');
    const femaleVoices = this.getVoicesByGender('female');

    let description = 'Available OpenAI TTS Voices:\n\n';

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
