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
    avatarVariants: Record<string, AvatarVariantEntry>;
    avatarVersions: Record<string, number>;
    sourceGameId: string;
    createdAt: number;
}

/** What the start screen needs to draw a card. Nothing here is secret. */
export interface StarterCard {
    id: string;
    title: string;
    hook: string;
    playerCount: number;
    language: string;
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

/**
 * Which of the template's portrait sets a new game shows. Candidate index == draw round
 * (every draw adds one candidate per character, cut from the same sheet), so one index for
 * the whole cast keeps the game in one drawing style. Picked at random among the rounds
 * every character still has; undefined when there is none in common (the game then keeps
 * the selection saved on the template). The player can switch any character afterwards.
 */
export function pickStarterPortraitRound(avatarVariants: Record<string, AvatarVariantEntry> | undefined, rng: () => number = Math.random): number | undefined {
    const entries = Object.values(avatarVariants ?? {});
    if (entries.length === 0) return undefined;
    const from = Math.max(...entries.map(e => e.first ?? 0));
    const to = Math.min(...entries.map(e => e.n));
    if (!(to > from)) return undefined;
    return from + Math.floor(rng() * (to - from));
}
