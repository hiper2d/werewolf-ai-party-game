import {Game, GAME_MASTER} from '@/app/api/game-models';
import {getVoiceConfig} from '@/app/ai/voice-config';
import {voiceForAuthor} from './game-voice';
import {gameAudioKey} from '@/app/api/game-audio';

jest.mock('@/firebase/server', () => ({db: null}));

const voices = getVoiceConfig('google').getVoices().map(v => v.id);
const game = {
    voiceProvider: 'google', gameMasterVoice: voices[0], gameMasterVoiceStyle: 'grave',
    bots: [{name: 'Doc', voice: voices[1], voiceStyle: 'warm'}, {name: 'Vil', voice: voices[2]}],
} as unknown as Game;

describe('voiceForAuthor', () => {
    it('reads the Game Master and each character in their own voice', () => {
        expect(voiceForAuthor(game, GAME_MASTER)).toEqual({voiceProvider: 'google', voice: voices[0], voiceStyle: 'grave'});
        expect(voiceForAuthor(game, 'Doc')).toEqual({voiceProvider: 'google', voice: voices[1], voiceStyle: 'warm'});
    });

    it('reads a player in the first voice no character uses', () => {
        expect(voiceForAuthor(game, 'Alex')).toEqual({voiceProvider: 'google', voice: voices[3]});
    });
});

describe('gameAudioKey', () => {
    const voice = voiceForAuthor(game, 'Doc');
    const key = gameAudioKey('m1', voice, 'Hello.');

    it('is the same for the same line in the same voice', () => {
        expect(gameAudioKey('m1', voiceForAuthor(game, 'Doc'), 'Hello.')).toBe(key);
    });

    it('changes with the message, the words, the voice and the direction', () => {
        const others = [
            gameAudioKey('m2', voice, 'Hello.'),
            gameAudioKey('m1', voice, 'Hello!'),
            gameAudioKey('m1', {...voice, voice: voices[4]}, 'Hello.'),
            gameAudioKey('m1', {...voice, voiceStyle: 'cold'}, 'Hello.'),
        ];
        expect(new Set([key, ...others]).size).toBe(5);
    });
});
