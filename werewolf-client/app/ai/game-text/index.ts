/**
 * Code-written game text in the game's language.
 *
 * Resolution for one line, per key:
 *   1. the static locale for `game.language` (./locales/<code>.json) — the normal case;
 *   2. the game's stored `gameText` pack — only games created 2026-10-28..30, when the lines
 *      were translated per game by a model (kept so those games keep rendering as they did);
 *   3. the English line.
 * Steps 2 and 3 exist for old documents and unknown keys, not as a design: the locale test
 * guarantees every language file is complete for the current English source.
 */
import { GAME_ROLES, ROLE_CONFIGS } from '@/app/api/game-models';
import { fillPlaceholders, GAME_TEXT_EN, type GameTextKey } from './en';
import { gameTextLocale } from './locales';

export { GAME_TEXT_EN, GAME_TEXT_KEYS, lineHash, placeholdersOf, type GameTextKey } from './en';
export { GAME_TEXT_LOCALES, gameTextLocale, type GameTextLocale } from './locales';

/** A per-game translation of GAME_TEXT_EN (legacy, see the header). */
export type GameTextPack = Partial<Record<GameTextKey, string>>;

/** What a site needs to render text: the game's language, and its legacy pack if any. */
export interface GameTextSource {
    language?: string | null;
    gameText?: GameTextPack | null;
}

const usable = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** One code-written line in the game's language, with its {placeholders} filled. */
export function gameText(game: GameTextSource | null | undefined, key: GameTextKey, params: Record<string, string | number> = {}): string {
    const fromLocale = gameTextLocale(game?.language)?.lines[key];
    const fromPack = game?.gameText?.[key];
    const line = usable(fromLocale) ? fromLocale : usable(fromPack) ? fromPack : GAME_TEXT_EN[key];
    return fillPlaceholders(line, params);
}

/** The role's name for role reveals and announcements, in the game's language. */
export function roleName(game: GameTextSource | null | undefined, role: string, plural = false): string {
    const key = (plural && role === GAME_ROLES.WEREWOLF ? 'role_werewolves' : `role_${role}`) as GameTextKey;
    return key in GAME_TEXT_EN ? gameText(game, key) : role;
}

/** The public "it's this role's turn" line. `plural` = more than one werewolf is alive. */
export function nightTurnText(game: GameTextSource | null | undefined, role: string, plural = false): string {
    const key = (plural && role === GAME_ROLES.WEREWOLF ? 'night_turn_werewolves' : `night_turn_${role}`) as GameTextKey;
    return key in GAME_TEXT_EN
        ? gameText(game, key)
        : `🌙 **Night Phase**: It's time for the ${role} to act. ${ROLE_CONFIGS[role]?.description ?? ''}.`;
}

/** The day-vote elimination line with the role reveal. */
export function eliminationText(game: GameTextSource | null | undefined, name: string, role: string): string {
    const key = `eliminated_${role}` as GameTextKey;
    return key in GAME_TEXT_EN ? gameText(game, key, { name }) : gameText(game, 'eliminated', { name, role: roleName(game, role) });
}
