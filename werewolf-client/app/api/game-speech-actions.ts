'use server';

import {auth} from '@/auth';
import {db} from '@/firebase/server';
import {getGame} from '@/app/api/game-actions';
import {viewerOf} from '@/app/api/game-session-view';
import {viewMessagesAs} from '@/app/utils/game-view';
import {voiceForAuthor} from '@/app/utils/game-voice';
import {generateSpeechWithProvider, SpeechResult} from '@/app/api/tts-actions';
import {AUDIO_CLAIM_MAX_AGE_MS, claimGameAudio, gameAudioKey, readGameAudio, releaseGameAudio, storeGameAudio} from '@/app/api/game-audio';
import {GameMessage} from '@/app/api/game-models';
import type {SpeechSource} from '@/app/api/feature-events';
import {logger} from '@/app/utils/logger';

/** Longer than any line the chat shows; a guard against a request that is not from the page. */
const MAX_SPOKEN_CHARS = 8000;
const WAIT_STEP_MS = 1500;

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One line of a game, read aloud: the stored recording when there is one, otherwise it is
 * recorded now, stored, and paid for once by whoever asked first (app/api/game-audio.ts).
 * The voice is the SERVER's answer for the line's author; the browser sends only which
 * message and the words as it shows them (the chat and the cinematic screen format a vote
 * or a night action differently, and each wording is its own recording).
 *
 * The caller must have a seat in the game and be allowed to read the message. Failures come
 * back as a value (a thrown error loses its message in production).
 */
export async function speakGameLine(gameId: string, messageId: string, text: string, source?: SpeechSource): Promise<SpeechResult> {
    try {
        const session = await auth();
        const email = session?.user?.email;
        if (!email) return {ok: false, error: 'Not authenticated'};
        const spoken = typeof text === 'string' ? text.trim() : '';
        if (!db || typeof gameId !== 'string' || typeof messageId !== 'string' || !gameId || !messageId || !spoken || spoken.length > MAX_SPOKEN_CHARS) {
            return {ok: false, error: 'Nothing to read'};
        }

        const game = await getGame(gameId);
        const viewer = game ? viewerOf(game, email) : null;
        if (!game || !viewer) return {ok: false, error: 'Game not found'};
        const stored = await db.collection('games').doc(gameId).collection('messages').doc(messageId).get();
        const message = stored.exists ? {id: stored.id, ...stored.data()} as GameMessage : null;
        if (!message || viewMessagesAs(game, viewer, [message]).length === 0) {
            return {ok: false, error: 'Message not found'};
        }

        const voice = voiceForAuthor(game, message.authorName);
        const key = gameAudioKey(messageId, voice, spoken);
        const record = () => generateSpeechWithProvider(spoken, {voice: voice.voice, voiceStyle: voice.voiceStyle, gameId, source}, voice.voiceProvider);

        const deadline = Date.now() + AUDIO_CLAIM_MAX_AGE_MS;
        while (Date.now() < deadline) {
            const claim = await claimGameAudio(gameId, key, email);
            if (claim === 'ready') {
                const audio = await readGameAudio(gameId, key);
                if (audio) return {ok: true, audio};
                // The record is there and a part is not: record it again over the top.
                await releaseGameAudio(gameId, key);
                continue;
            }
            if (claim === 'busy') {
                // Somebody is recording this very line: wait for theirs instead of paying for a second.
                await pause(WAIT_STEP_MS);
                continue;
            }
            try {
                const audio = await record();
                // Keeping the recording is a saving, not part of reading the line: a failed
                // write costs the next listener a new recording, never this one their line.
                await storeGameAudio(gameId, key, audio, {messageId, voice, by: email}).catch(async error => {
                    logger.warn('Could not store a spoken line', {gameId, messageId, error: error?.message});
                    await releaseGameAudio(gameId, key);
                });
                return {ok: true, audio};
            } catch (error) {
                await releaseGameAudio(gameId, key);
                throw error;
            }
        }
        // The other recording never arrived: read the line for this listener anyway.
        return {ok: true, audio: await record()};
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Speech generation failed: ${message}`, {function: 'speakGameLine', gameId, messageId, error: message});
        return {ok: false, error: message};
    } finally {
        try { await logger.flush(); } catch { /* logging must never fail playback */ }
    }
}
