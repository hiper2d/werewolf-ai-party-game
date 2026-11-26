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
    /** Set on a clip recorded for a translation (StarterLocale): the language code. */
    lang?: string;
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
    /**
     * The other languages this story can be played in: a translation exists in
     * `starterGames/{id}/locales/{code}` (StarterLocale). Kept by
     * scripts/translate-starter-game.ts; the template's own `language` is not listed.
     */
    languages?: string[];
    avatarVariants: Record<string, AvatarVariantEntry>;
    avatarVersions: Record<string, number>;
    sourceGameId: string;
    createdAt: number;
}

export const STARTER_LOCALES_COLLECTION = 'locales';

/**
 * A translation of a template's player-facing text (`starterGames/{id}/locales/{code}`),
 * written by scripts/translate-starter-game.ts. Translated: the opening story, each
 * character's backstory and introduction. NOT translated: names (identifiers, also the
 * portrait keys), play styles, voice and picture directions (prompts, English in every
 * game), the card copy (app chrome). A game in this language is an ordinary game with
 * `language` set, so everything written after the introductions comes from the models in
 * that language.
 */
export interface StarterLocale {
    language: string;
    story: string;
    /** By character name. */
    bots: Record<string, {story: string; intro: string}>;
    /**
     * The hash (starterTextHash) of the English text each piece was translated from, by
     * piece key (starterLocalePieces). A piece whose English changed since is stale, and a
     * stale locale is not used: the game falls back to the template's language.
     */
    sources: Record<string, string>;
    /** Voice clips of THIS translation; audio docs are `audio/{code}__{clipKey}`. */
    clips?: Record<string, StarterClip>;
    updatedAt: number;
}

/**
 * How a translation names the human player. English text carries the source game's human
 * name (`humanPlaceholder`), swapped as a whole word; that test fails where a particle is
 * glued to the name (Japanese "Rowanさん", Korean "Rowan은"), so the translator is given this
 * token in the name's place and a game puts the player's name where it stands.
 */
export const STARTER_PLAYER_TOKEN = '{player}';

/** The player's name into a piece of template text: the token (translations), then the placeholder (English). */
export function withStarterPlayerName(text: string, placeholder: string, name: string): string {
    return replacePlaceholderName(text.split(STARTER_PLAYER_TOKEN).join(name), placeholder, name);
}

/** True when the line names the human, by placeholder or by token: it cannot be pre-recorded. */
export function namesStarterPlayer(text: string, placeholder: string): boolean {
    return text.includes(STARTER_PLAYER_TOKEN) || mentionsPlaceholder(text, placeholder);
}

/** FNV-1a, as the game-text locales use: a change detector, not a secret. */
export function starterTextHash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

type StarterTextSource = Pick<StarterTemplate, 'story'> & {bots: Pick<StarterBot, 'name' | 'story' | 'intro'>[]};

/** The translatable pieces of a template, by piece key: `story`, `<name>.story`, `<name>.intro`. */
export function starterLocalePieces(template: StarterTextSource): Record<string, string> {
    const pieces: Record<string, string> = {story: template.story};
    for (const bot of template.bots) {
        pieces[`${bot.name}.story`] = bot.story;
        pieces[`${bot.name}.intro`] = bot.intro;
    }
    return pieces;
}

/** The piece keys a locale lacks or holds a translation of older English text for. */
export function staleStarterLocalePieces(template: StarterTextSource, locale: Pick<StarterLocale, 'story' | 'bots' | 'sources'> | undefined | null): string[] {
    const pieces = starterLocalePieces(template);
    return Object.keys(pieces).filter(key => {
        if (!locale) return true;
        const [name, field] = key === 'story' ? [undefined, 'story'] : [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
        const text = name === undefined ? locale.story : locale.bots?.[name]?.[field as 'story' | 'intro'];
        return !text?.trim() || locale.sources?.[key] !== starterTextHash(pieces[key]);
    });
}

/**
 * The text a new game is written with: the template's own, or a COMPLETE and current
 * translation. Anything less (no locale, a missing character, English edited since) gives
 * the template's language back, so a game is never half translated.
 */
export function starterTextFor(
    template: StarterTextSource & Pick<StarterTemplate, 'language' | 'clips'>,
    language: string | undefined,
    locale: StarterLocale | undefined | null,
): {language: string; story: string; bots: {story: string; intro: string}[]; clips?: Record<string, StarterClip>} {
    const own = {language: template.language, story: template.story, bots: template.bots.map(b => ({story: b.story, intro: b.intro})), clips: template.clips};
    if (!language || language === template.language || !locale || locale.language !== language) return own;
    if (staleStarterLocalePieces(template, locale).length > 0) return own;
    return {
        language,
        story: locale.story,
        bots: template.bots.map(b => ({story: locale.bots[b.name].story, intro: locale.bots[b.name].intro})),
        clips: locale.clips,
    };
}

/** The audio doc of a clip: the template's own under the clip key, a translation's under `{code}__{key}`. */
export function starterAudioDocId(clipKey: string, lang?: string): string {
    return lang ? `${lang}__${clipKey}` : clipKey;
}

/** The languages a card offers: the template's own first, then its translations. */
export function starterCardLanguages(template: Pick<StarterTemplate, 'language' | 'languages'>): string[] {
    return [...new Set([template.language || 'en', ...(template.languages ?? [])])];
}

/** What the start screen needs to draw a card. Nothing here is secret. */
export interface StarterCard {
    id: string;
    /** A draft, shown outside production only (see isStarterTemplateVisible). */
    draft?: boolean;
    /** The viewer's own unfinished game from this template, newest first: Play continues it. */
    resumeGameId?: string;
    /** A guest's one game is from another story: this one needs a sign-in. */
    locked?: boolean;
    /** The guest's game has reached day 2: continuing it needs a sign-in. */
    walled?: boolean;
    title: string;
    hook: string;
    playerCount: number;
    /** The table, for the role card shown while the game is created. */
    werewolfCount: number;
    specialRoles: string[];
    language: string;
    /** Every language the story can be started in, the template's own first. */
    languages: string[];
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
    return `/api/starter-games/${game.starterTemplateId}/audio/${encodeURIComponent(clipKey)}?v=${clip.version}${clip.lang ? `&lang=${clip.lang}` : ''}`;
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

/**
 * A guest's ONE game: the newest they own, whatever its story or state (a finished or walled
 * game still uses up the trial). Undefined when they have not started one.
 */
export function guestStarterGame<T extends {id: string; starterTemplateId?: string; createdAt?: number}>(games: T[]): T | undefined {
    return games
        .filter(game => !!game.starterTemplateId)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

/** sessionStorage key: this game's role card was read on the start screen, open the story. */
export const starterIntroKey = (gameId: string) => `starterIntro:${gameId}`;

/**
 * The table in one line, for the role card a starter game shows while it is created:
 * "9 at the table. Among them: 2 werewolves, a doctor and a detective."
 */
export function starterTableLine(playerCount: number, werewolfCount: number, specialRoles: string[]): string {
    const hidden = [
        werewolfCount === 1 ? 'a werewolf' : `${werewolfCount} werewolves`,
        ...specialRoles.map(role => `a ${role}`),
    ];
    const list = hidden.length === 1 ? hidden[0] : `${hidden.slice(0, -1).join(', ')} and ${hidden[hidden.length - 1]}`;
    return `${playerCount} at the table. Among them: ${list}.`;
}
