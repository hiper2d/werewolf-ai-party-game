Text to speech
==============

Learn how to turn text into lifelike spoken audio.

The Audio API provides a [`speech`](/docs/api-reference/audio/createSpeech) endpoint based on our [GPT-4o mini TTS (text-to-speech) model](/docs/models/gpt-4o-mini-tts). It comes with 11 built-in voices and can be used to:

*   Narrate a written blog post
*   Produce spoken audio in multiple languages

Quickstart
----------

The `speech` endpoint takes three key inputs:

1.  The [model](/docs/api-reference/audio/createSpeech#audio-createspeech-model) you're using
2.  The [text](/docs/api-reference/audio/createSpeech#audio-createspeech-input) to be turned into audio
3.  The [voice](/docs/api-reference/audio/createSpeech#audio-createspeech-voice) that will speak the output

Here's a simple request example:

Generate spoken audio from input text

```javascript
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI();
const speechFile = path.resolve("./speech.mp3");

const mp3 = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "coral",
  input: "Today is a wonderful day to build something people love!",
  instructions: "Speak in a cheerful and positive tone.",
});

const buffer = Buffer.from(await mp3.arrayBuffer());
await fs.promises.writeFile(speechFile, buffer);
```

By default, the endpoint outputs an MP3 of the spoken audio, but you can configure it to output any [supported format](/docs/guides/text-to-speech#supported-output-formats).

### Text-to-speech models

For intelligent realtime applications, use the `gpt-4o-mini-tts` model, our newest and most reliable text-to-speech model. You can prompt the model to control aspects of speech, including:

*   Accent
*   Emotional range
*   Intonation
*   Impressions
*   Speed of speech
*   Tone
*   Whispering

Our other text-to-speech models are `tts-1` and `tts-1-hd`. The `tts-1` model provides lower latency, but at a lower quality than the `tts-1-hd` model.

### Voice options

The TTS endpoint provides 11 built‑in voices to control how speech is rendered from text. **Hear and play with these voices in [OpenAI.fm](https://openai.fm), our interactive demo for trying the latest text-to-speech model in the OpenAI API**. Voices are currently optimized for English.

*   `alloy`
*   `ash`
*   `ballad`
*   `coral`
*   `echo`
*   `fable`
*   `nova`
*   `onyx`
*   `sage`
*   `shimmer`

Supported output formats
------------------------

The default response format is `mp3`, but other formats like `opus` and `wav` are available.

*   **MP3**: The default response format for general use cases.
*   **Opus**: For internet streaming and communication, low latency.
*   **AAC**: For digital audio compression, preferred by YouTube, Android, iOS.
*   **FLAC**: For lossless audio compression, favored by audio enthusiasts for archiving.
*   **WAV**: Uncompressed WAV audio, suitable for low-latency applications to avoid decoding overhead.
*   **PCM**: Similar to WAV but contains the raw samples in 24kHz (16-bit signed, low-endian), without the header.

For the fastest response times, we recommend using `wav` or `pcm` as the response format.

Examples of voice instructions
-------------------------------

### Medieval Knight

Affect: Deep, commanding, and slightly dramatic, with an archaic and reverent quality that reflects the grandeur of Olde English storytelling.
Tone: Noble, heroic, and formal, capturing the essence of medieval knights and epic quests, while reflecting the antiquated charm of Olde English.
Emotion: Excitement, anticipation, and a sense of mystery, combined with the seriousness of fate and duty.
Pronunciation: Clear, deliberate, and with a slightly formal cadence. Specific words like "hast," "thou," and "doth" should be pronounced slowly and with emphasis to reflect Olde English speech patterns.
Pause: Pauses after important Olde English phrases such as "Lo!" or "Hark!" and between clauses like "Choose thy path" to add weight to the decision-making process and allow the listener to reflect on the seriousness of the quest.

### Robot

Identity: A robot
Affect: Monotone, mechanical, and neutral, reflecting the robotic nature of the customer service agent.
Tone: Efficient, direct, and formal, with a focus on delivering information clearly and without emotion.
Emotion: Neutral and impersonal, with no emotional inflection, as the robot voice is focused purely on functionality.
Pauses: Brief and purposeful, allowing for processing and separating key pieces of information, such as confirming the return and refund details.
Pronunciation: Clear, precise, and consistent, with each word spoken distinctly to ensure the customer can easily follow the automated process.

### Serene

Voice Affect: Soft, gentle, soothing; embody tranquility.
Tone: Calm, reassuring, peaceful; convey genuine warmth and serenity.
Pacing: Slow, deliberate, and unhurried; pause gently after instructions to allow the listener time to relax and follow along.
Emotion: Deeply soothing and comforting; express genuine kindness and care.
Pronunciation: Smooth, soft articulation, slightly elongating vowels to create a sense of ease.
Pauses: Use thoughtful pauses, especially between breathing instructions and visualization guidance, enhancing relaxation and mindfulness.

### Cheerleader

Personality/affect: a high-energy cheerleader helping with administrative tasks
Voice: Enthusiastic, and bubbly, with an uplifting and motivational quality.
Tone: Encouraging and playful, making even simple tasks feel exciting and fun.
Dialect: Casual and upbeat, using informal phrasing and pep talk-style expressions.
Pronunciation: Crisp and lively, with exaggerated emphasis on positive words to keep the energy high.
Features: Uses motivational phrases, cheerful exclamations, and an energetic rhythm to create a sense of excitement and engagement.

### Patient teacher

Accent/Affect: Warm, refined, and gently instructive, reminiscent of a friendly art instructor.
Tone: Calm, encouraging, and articulate, clearly describing each step with patience.
Pacing: Slow and deliberate, pausing often to allow the listener to follow instructions comfortably.
Emotion: Cheerful, supportive, and pleasantly enthusiastic; convey genuine enjoyment and appreciation of art.
Pronunciation: Clearly articulate artistic terminology (e.g., "brushstrokes," "landscape," "palette") with gentle emphasis.
Personality Affect: Friendly and approachable with a hint of sophistication; speak confidently and reassuringly, guiding users through each painting step patiently and warmly.