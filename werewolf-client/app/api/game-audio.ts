import {createHash} from 'crypto';
import {db} from '@/firebase/server';
import {SpeakerVoice} from '@/app/utils/game-voice';

/**
 * Spoken lines of a game, recorded ONCE (docs/plan-multiplayer.md §12): `games/{id}/audio/{key}`
 * is the record, `…/audio/{key}__{n}` its sound in parts. Until 2026-11-27 every press of
 * the speaker button, every reload and every listener generated the line again and paid for
 * it again; with several players in one game each of them would have.
 *
 * The key is a hash of the message, the voice, the direction and the TEXT, so a voice
 * changed mid-game gives a new recording, and a browser that sends other words for a
 * message only makes a recording nobody else's key points to.
 *
 * The sound is stored as the voice model returned it (WAV, about 48 KB a second), cut into
 * parts under Firestore's 1 MiB document limit. Not re-encoded on the way: that needs a
 * codec the serverless runtime does not have, and processor time the hosting plan meters.
 *
 * NOT a 'use server' file. Storage only: who may hear a line and who pays for it is the
 * caller's (app/api/game-speech-actions.ts).
 */
export const GAME_AUDIO_COLLECTION = 'audio';

const PART_BYTES = 900_000;
/** A claim older than this belongs to a call that died; longer than the voice model's slowest line. */
export const AUDIO_CLAIM_MAX_AGE_MS = 90_000;

export function gameAudioKey(messageId: string, voice: SpeakerVoice, text: string): string {
    return createHash('sha256')
        .update(JSON.stringify([messageId, voice.voiceProvider, voice.voice, voice.voiceStyle || '', text]))
        .digest('hex').slice(0, 32);
}

const audioRef = (gameId: string, key: string) =>
    db!.collection('games').doc(gameId).collection(GAME_AUDIO_COLLECTION).doc(key);

export type AudioClaim = 'ready' | 'claimed' | 'busy';

/**
 * Who records this line? `ready`: it is recorded. `claimed`: the caller records it now.
 * `busy`: another call is recording it. One transaction, so two listeners who press play
 * together make one recording.
 */
export async function claimGameAudio(gameId: string, key: string, by: string): Promise<AudioClaim> {
    const ref = audioRef(gameId, key);
    return db!.runTransaction(async tx => {
        const record = (await tx.get(ref)).data();
        if (record?.status === 'ready') return 'ready';
        if (record?.status === 'recording' && Date.now() - (record.at || 0) < AUDIO_CLAIM_MAX_AGE_MS) return 'busy';
        tx.set(ref, {status: 'recording', at: Date.now(), by});
        return 'claimed';
    });
}

/** Stores a recording under a claim the caller holds. */
export async function storeGameAudio(gameId: string, key: string, audio: ArrayBuffer, meta: {messageId: string; voice: SpeakerVoice; by: string}): Promise<void> {
    const bytes = Buffer.from(audio);
    const parts = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
    const ref = audioRef(gameId, key);
    for (let i = 0; i < parts; i++) {
        await audioRef(gameId, `${key}__${i}`).set({data: bytes.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)});
    }
    // The record says "ready" only once every part is in place.
    await ref.set({
        status: 'ready', at: Date.now(), by: meta.by, messageId: meta.messageId, parts, bytes: bytes.length,
        mime: 'audio/wav', provider: meta.voice.voiceProvider, voice: meta.voice.voice,
    });
}

/** Gives up a claim (the recording failed), so the next listener can try. */
export async function releaseGameAudio(gameId: string, key: string): Promise<void> {
    await audioRef(gameId, key).delete().catch(() => undefined);
}

/** The stored sound, or null when the line is not recorded (or a part is missing). */
export async function readGameAudio(gameId: string, key: string): Promise<ArrayBuffer | null> {
    const record = (await audioRef(gameId, key).get()).data();
    if (record?.status !== 'ready' || !record.parts) return null;
    const parts = await Promise.all(
        Array.from({length: record.parts}, (_, i) => audioRef(gameId, `${key}__${i}`).get()),
    );
    const chunks: Buffer[] = [];
    for (const part of parts) {
        const data = part.data()?.data;
        if (!data) return null;
        chunks.push(Buffer.from(data));
    }
    const whole = Buffer.concat(chunks);
    return whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length) as ArrayBuffer;
}
