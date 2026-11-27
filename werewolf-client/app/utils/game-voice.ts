import {Game, GAME_MASTER} from '@/app/api/game-models';
import {getVoiceConfig, LEGACY_VOICE_PROVIDER, VoiceProvider} from '@/app/ai/voice-config';

export interface SpeakerVoice {
    voiceProvider: VoiceProvider;
    voice: string;
    voiceStyle?: string;
}

/**
 * The voice a line by `authorName` is read in: the Game Master's, the character's, and for
 * a player without an assigned voice the provider's first voice no character uses, so their
 * lines never sound like a bot's. Pure and shared: the page uses it to play a line and the
 * server to record one (app/api/game-speech-actions.ts), and both must name the same voice
 * or a stored recording would never be found again.
 */
export function voiceForAuthor(game: Game, authorName: string | null | undefined): SpeakerVoice {
    // The game's voice set is fixed at creation; legacy games read as the old default.
    const voiceProvider = game.voiceProvider || LEGACY_VOICE_PROVIDER;
    const providerVoices = getVoiceConfig(voiceProvider).getVoices().map(v => v.id);
    const taken = new Set([game.gameMasterVoice, ...game.bots.map(b => b.voice)]);
    const fallback = providerVoices.find(id => !taken.has(id)) ?? providerVoices[0];

    if (!authorName || authorName === GAME_MASTER) {
        return {
            voiceProvider,
            voice: game.gameMasterVoice || fallback,
            ...(authorName ? {voiceStyle: game.gameMasterVoiceStyle} : {}),
        };
    }
    const bot = game.bots.find(b => b.name === authorName);
    return bot
        ? {voiceProvider, voice: bot.voice || fallback, voiceStyle: bot.voiceStyle}
        : {voiceProvider, voice: fallback};
}
