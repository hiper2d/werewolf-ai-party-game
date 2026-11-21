import {AvatarVariantEntry, GAME_ROLES, GameMode} from "@/app/api/game-models";
import type {VoiceProvider} from "@/app/ai/voice-config";

/**
 * Starter games: pre-built first games a new player starts with one click
 * (docs/plan-growth-roadmap.md, track 1). A template is a snapshot of a real game taken
 * right after its introductions (scripts/snapshot-starter-game.ts): the cast, the opening
 * story, each character's introduction, and every portrait already drawn. Creating a game
 * from it costs no model call and no image call, and the player lands in day 1 with the
 * introductions already in the chat.
 *
 * What a template does NOT fix: roles (dealt per game, the human is always a villager) and
 * models (dealt per game from the cheapest group), so the same story plays differently.
 */
export const STARTER_GAMES_COLLECTION = 'starterGames';

export interface StarterBot {
    name: string;
    story: string;
    gender: 'male' | 'female';
    voice: string;
    voiceStyle?: string;
    playStyle: string;
    visualDescription?: string;
    /** The character's introduction, as it was written in the source game. */
    intro: string;
}

export interface StarterStyleSet {
    /** Short name for the script's listing: "anime", "realism". */
    label: string;
    /** The art direction the set was drawn with; becomes the game's `artStyle`. */
    artStyle: string;
}

export interface StarterClip {
    /** The voice the clip was read in: a game plays it only while the speaker still has it. */
    voice: string;
    /** Bumped on every re-record, so browsers and the CDN never serve the old take. */
    version: number;
}

/** The clip key of the opening story; a bot's introduction is keyed by the bot's name. */
export const STARTER_STORY_CLIP = 'story';

export interface StarterTemplate {
    id: string;
    /** Only `live` templates are offered to players; `draft` is for review. */
    status: 'draft' | 'live';
    /** Card order on the start screen, ascending. */
    order: number;
    /** Card copy. */
    title: string;
    hook: string;
    theme: string;
    description: string;
    artStyle?: string;
    gameMode: GameMode;
    language: string;
    longReplies: boolean;
    voiceProvider?: VoiceProvider;
    gameMasterVoice: string;
    gameMasterVoiceStyle?: string;
    /** Preferred Game Master model; used when it is still a starter model, else one is dealt. */
    gameMasterAiType?: string;
    /** The opening story. May contain `humanPlaceholder`. */
    story: string;
    /**
     * The human's name in the source game. Replaced, as a whole word, by the player's name in
     * the story and the introductions; it is also the human's portrait key in the template.
     */
    humanPlaceholder: string;
    werewolfCount: number;
    specialRoles: string[];
    /** In introduction order. */
    bots: StarterBot[];
    avatarsVersion: number;
    /**
     * The art styles this template was drawn in, keyed by portrait round (as a string:
     * Firestore map). Each has its own portraits (that round's candidates) and its own scene
     * pair (`scene-welcome__{round}`, `scene-night__{round}`), drawn by
     * scripts/draw-starter-style.ts. A new game gets ONE of them at random, with its art
     * style text, so the Game Master's live illustrations match. Absent or empty: the
     * template has only the portraits of its source game.
     */
    styleSets?: Record<string, StarterStyleSet>;
    /**
     * Pre-recorded voice clips, by clip key (STARTER_STORY_CLIP for the opening story, a
     * bot's name for its introduction): the audio is in `starterGames/{id}/audio/{key}`,
     * recorded once by scripts/record-starter-voices.ts. A game plays the clip instead of
     * calling the voice model, so the first minute costs nothing and starts at once. Only
     * lines that do not name the human are recorded (the name differs per player).
     */
    clips?: Record<string, StarterClip>;
    avatarVariants: Record<string, AvatarVariantEntry>;
    avatarVersions: Record<string, number>;
    sourceGameId: string;
    createdAt: number;
}

/** What the start screen needs to draw a card. Nothing here is secret. */
export interface StarterCard {
    id: string;
    /** A draft, shown outside production only (see isStarterTemplateVisible). */
    draft?: boolean;
    /** The viewer's own unfinished game from this template, newest first: Play continues it. */
    resumeGameId?: string;
    title: string;
    hook: string;
    playerCount: number;
    language: string;
}

/**
 * Whether a template is offered to players. Production shows `live` templates only. Local
 * development shares the production database, so there a `draft` is shown too: a template
 * can be built and played locally without ever being published to real players.
 */
export function isStarterTemplateVisible(status: string | undefined, isProduction: boolean): boolean {
    return status === 'live' || (!isProduction && status === 'draft');
}

const NAME_CHAR = '[\\p{L}\\p{N}\\p{M}]';

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces the template's placeholder human name with the player's, whole words only and in
 * the exact case it was written ("Rowan" → "Mira", but not "rowan" the tree or "Rowanberry").
 * Word boundaries are Unicode-aware: names are letters and digits of any script.
 */
export function replacePlaceholderName(text: string, placeholder: string, name: string): string {
    if (!placeholder || placeholder === name) return text;
    const pattern = new RegExp(`(?<!${NAME_CHAR})${escapeRegExp(placeholder)}(?!${NAME_CHAR})`, 'gu');
    return text.replace(pattern, () => name);
}

function shuffled<T>(items: T[], rng: () => number): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Roles for the bots of a starter game, in bot order. The human is always a villager (the
 * simplest role to learn: talk, suspect, vote), so every wolf and special role goes to a bot.
 */
export function dealStarterRoles(botCount: number, werewolfCount: number, specialRoles: string[], rng: () => number = Math.random): string[] {
    const roles: string[] = [...specialRoles, ...Array(werewolfCount).fill(GAME_ROLES.WEREWOLF)];
    if (roles.length > botCount) {
        throw new Error(`Starter template roles don't fit: ${roles.length} role slots for ${botCount} bots`);
    }
    roles.push(...Array(botCount - roles.length).fill(GAME_ROLES.VILLAGER));
    return shuffled(roles, rng);
}

/**
 * One model per bot from `models` (the cheapest group): every model once before any repeats,
 * so a six-bot table of eight models has six different ones.
 */
export function dealStarterModels(botCount: number, models: string[], rng: () => number = Math.random): string[] {
    if (models.length === 0) {
        throw new Error('No starter models available');
    }
    const dealt: string[] = [];
    while (dealt.length < botCount) {
        dealt.push(...shuffled(models, rng));
    }
    return dealt.slice(0, botCount);
}

/** The Game Master of a starter game: the template's own if it is still eligible, else a dealt one. */
export function pickStarterGameMaster(preferred: string | undefined, eligible: string[], rng: () => number = Math.random): string {
    if (eligible.length === 0) {
        throw new Error('No starter model can be the Game Master');
    }
    if (preferred && eligible.includes(preferred)) return preferred;
    return eligible[Math.floor(rng() * eligible.length)];
}

/**
 * A template's avatar doc id as it should be in a game: the human's portrait docs are keyed
 * by the placeholder name in the template (`Rowan`, `Rowan__0`) and by the player's name in
 * the game. Every other id (bots, scenes, sheets, the GM) is copied as is.
 */
export function starterAvatarDocId(docId: string, placeholder: string, humanName: string): string {
    if (docId === placeholder) return humanName;
    if (docId.startsWith(`${placeholder}__`)) return `${humanName}${docId.slice(placeholder.length)}`;
    return docId;
}

/** A per-key avatar map (`avatarVariants`, `avatarVersions`) with the human's key renamed. */
export function renameHumanAvatarKey<T>(map: Record<string, T> | undefined, placeholder: string, humanName: string): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(map ?? {})) {
        result[key === placeholder ? humanName : key] = value;
    }
    return result;
}

/** Mid-game illustrations of the source game never belong in a template. */
export function isIllustrationDocId(docId: string): boolean {
    return docId.startsWith('illustration-');
}

/**
 * The name the start screen proposes: the first word of the account's display name, reduced
 * to what a player name may contain (letters and digits of any script) and cut to `maxLength`.
 * Empty when nothing usable is left; the player then types one.
 */
export function starterDefaultName(displayName: string | null | undefined, maxLength: number = 24): string {
    const firstWord = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
    return firstWord.normalize('NFC').replace(/[^\p{L}\p{N}\p{M}]/gu, '').slice(0, maxLength);
}

/** The portrait rounds every character of the cast still has: [from, to). */
export function commonPortraitRounds(avatarVariants: Record<string, AvatarVariantEntry> | undefined): {from: number; to: number} | undefined {
    const entries = Object.values(avatarVariants ?? {});
    if (entries.length === 0) return undefined;
    const from = Math.max(...entries.map(e => e.first ?? 0));
    const to = Math.min(...entries.map(e => e.n));
    return to > from ? {from, to} : undefined;
}

/**
 * Which of the template's portrait sets a new game shows. Candidate index == draw round
 * (every draw adds one candidate per character, cut from the same sheet), so one index for
 * the whole cast is one drawing. With `styleSets` the pick is among the styled rounds (one
 * anime, one realistic, ...); without, among every round the cast has in common. Undefined
 * when there is none (the game then keeps the selection saved on the template). The player
 * can switch any character afterwards.
 */
export function pickStarterPortraitRound(
    avatarVariants: Record<string, AvatarVariantEntry> | undefined,
    rng: () => number = Math.random,
    styleSets?: Record<string, StarterStyleSet>,
): number | undefined {
    const window = commonPortraitRounds(avatarVariants);
    if (!window) return undefined;
    let rounds: number[] = [];
    for (let round = window.from; round < window.to; round++) rounds.push(round);
    const styled = rounds.filter(round => !!styleSets?.[String(round)]);
    if (styled.length > 0) rounds = styled;
    return rounds[Math.floor(rng() * rounds.length)];
}

/** A style's scene doc in a template: `scene-welcome__2`. Games hold plain `scene-welcome`. */
export function starterSceneDocId(sceneKey: string, round: number): string {
    return `${sceneKey}__${round}`;
}

/** Parses a per-style scene doc id; null for anything else. */
export function parseStarterSceneDocId(docId: string): {sceneKey: string; round: number} | null {
    const match = docId.match(/^(scene-[a-z]+)__(\d+)$/);
    return match ? {sceneKey: match[1], round: Number(match[2])} : null;
}

/** The style sets whose portraits still exist (rounds past the candidate cap are dropped). */
export function pruneStyleSets(styleSets: Record<string, StarterStyleSet> | undefined, avatarVariants: Record<string, AvatarVariantEntry> | undefined): Record<string, StarterStyleSet> {
    const window = commonPortraitRounds(avatarVariants);
    const kept: Record<string, StarterStyleSet> = {};
    for (const [round, set] of Object.entries(styleSets ?? {})) {
        if (window && Number(round) >= window.from && Number(round) < window.to) kept[round] = set;
    }
    return kept;
}

/** True when `text` names the human placeholder as a whole word (see replacePlaceholderName). */
export function mentionsPlaceholder(text: string, placeholder: string): boolean {
    if (!placeholder) return false;
    return new RegExp(`(?<!${NAME_CHAR})${escapeRegExp(placeholder)}(?!${NAME_CHAR})`, 'u').test(text);
}

/**
 * Which pre-recorded clip, if any, reads this message: the opening story (the Game Master's
 * day-1 GAME_STORY) or a bot's introduction. Message types as strings so this stays free of
 * the enum import on the client path.
 */
export function starterClipKeyFor(message: {messageType: string; authorName: string; day: number}, gameMasterName: string): string | null {
    if (message.day !== 1) return null;
    if (message.messageType === 'GAME_STORY' && message.authorName === gameMasterName) return STARTER_STORY_CLIP;
    if (message.messageType === 'BOT_WELCOME') return message.authorName;
    return null;
}

/**
 * The URL of the pre-recorded clip for a message of a starter game, or undefined when the
 * line must be read live: not a starter game, no clip for it, or the speaker's voice was
 * changed since (`currentVoice`), in which case the old take would be the wrong voice.
 */
export function starterClipUrl(
    game: {starterTemplateId?: string; starterClips?: Record<string, StarterClip>},
    clipKey: string | null,
    currentVoice: string | undefined,
): string | undefined {
    if (!game.starterTemplateId || !clipKey) return undefined;
    const clip = game.starterClips?.[clipKey];
    if (!clip || clip.voice !== currentVoice) return undefined;
    return `/api/starter-games/${game.starterTemplateId}/audio/${encodeURIComponent(clipKey)}?v=${clip.version}`;
}

/**
 * The game a player would continue for each template: their newest game from it that is not
 * over. Going back to the start screen and pressing the card again must not deal a second
 * game while the first is still on the table.
 */
export function resumableStarterGames(games: {id: string; starterTemplateId?: string; gameState?: string; createdAt?: number}[]): Record<string, string> {
    const newest: Record<string, {id: string; createdAt: number}> = {};
    for (const game of games) {
        if (!game.starterTemplateId || game.gameState === 'GAME_OVER') continue;
        const createdAt = game.createdAt ?? 0;
        const current = newest[game.starterTemplateId];
        if (!current || createdAt > current.createdAt) newest[game.starterTemplateId] = {id: game.id, createdAt};
    }
    return Object.fromEntries(Object.entries(newest).map(([templateId, game]) => [templateId, game.id]));
}
