import {AVATAR_GM_KEY, AvatarFraming, avatarSheetKey, AvatarVariantEntry, Game, GAME_MASTER, MANNEQUIN_VARIANT_INDEX, ReframeTarget, SCENE_NIGHT_KEY, SCENE_WELCOME_KEY} from "@/app/api/game-models";
import {getPresetAvatarUrl, getPresetFraming, PRESET_SHEET_SIZE, PRESET_SHEET_URL} from "@/app/utils/preset-avatars";
import {circleFocus, circleFocusOnSheet, cardFocus, ImageFocus} from "@/app/utils/avatar-framing";

/**
 * URL of a participant's portrait. While the themed set is generating (or
 * failed), bots and the GM get a universal preset sketch (static asset, instant)
 * assigned deterministically by gender — see preset-avatars.ts. The human player
 * has no gender on record and returns undefined (initial-letter fallback). When
 * avatarsStatus flips to 'ready', the same call sites swap to the themed art —
 * unless the owner parked this character on the mannequin, which serves the
 * same preset sketch on purpose.
 */
export function getAvatarUrl(game: Game, name: string): string | undefined {
    const key = name === GAME_MASTER ? AVATAR_GM_KEY : name;
    if (game.avatarsStatus !== 'ready' || game.avatarVariants?.[key]?.sel === MANNEQUIN_VARIANT_INDEX) {
        return getPresetAvatarUrl(game.bots, name);
    }
    return `/api/games/${game.id}/avatars/${encodeURIComponent(key)}?v=${avatarVersion(game, key)}`;
}

/** Cache-buster for one portrait. Switching a character to another candidate
 * bumps only that key, so picking a new face for one player doesn't force the
 * browser to re-download the whole cast. */
export function avatarVersion(game: Game, key: string): number {
    return game.avatarVersions?.[key] ?? game.avatarsVersion ?? 0;
}

/** A character's switchable portrait candidates: the stored generated ones
 * live at indices [first, first+count) (older draws past the cap are deleted;
 * the ids of the kept ones never shift), `selected` may also be
 * MANNEQUIN_VARIANT_INDEX. `hasCandidates` is false for games generated before
 * candidates existed — they have one fixed portrait and nothing to switch. */
export function getAvatarVariantState(game: Game, name: string): {key: string; count: number; selected: number; first: number; hasCandidates: boolean} {
    const key = name === GAME_MASTER ? AVATAR_GM_KEY : name;
    const entry = game.avatarVariants?.[key];
    const first = entry?.first ?? 0;
    return {
        key,
        count: entry ? entry.n - first : 1,
        selected: entry?.sel ?? 0,
        first,
        hasCandidates: !!entry,
    };
}

/**
 * URL of a thematic chat scene image ('welcome' rides with the GM's opening
 * story, 'night' with each night-begins message), or undefined when the game
 * has no generated set. Scene generation can fail independently of avatars —
 * render with an onError fallback that hides the image.
 */
export function getSceneUrl(game: Game, scene: 'welcome' | 'night'): string | undefined {
    if (game.avatarsStatus !== 'ready') return undefined;
    return `/api/games/${game.id}/avatars/${scene === 'welcome' ? SCENE_WELCOME_KEY : SCENE_NIGHT_KEY}?v=${game.avatarsVersion ?? 0}`;
}

/**
 * URL of a mid-game illustration by its subcollection key (from a
 * GM_ILLUSTRATION message's sceneKey). No avatarsStatus gate: the message only
 * exists because the image doc was committed first.
 */
export function getIllustrationUrl(game: Game, sceneKey: string): string {
    return `/api/games/${game.id}/avatars/${encodeURIComponent(sceneKey)}?v=${game.avatarsVersion ?? 0}`;
}

/**
 * What a renderer needs to show a participant: the image URL plus,
 * optionally, which part of it (see avatar-framing.ts). Three cases:
 * - a reframed mannequin: the static preset SHEET with the circle (or the
 *   card, for posters) cut out of it by CSS;
 * - a drawn portrait with framing: the stored card, circle applied by CSS;
 * - anything older: the plain URL, and the renderer keeps its legacy crop.
 * `blend` = multiply the (white-ground) mannequin over the name gradient.
 */
export interface AvatarView {
    url: string;
    // For round avatars: the circle. For cards/posters: `cardFocus`.
    focus?: ImageFocus;
    cardFocus?: ImageFocus;
    blend: boolean;
}

export function getAvatarView(game: Game, name: string): AvatarView | undefined {
    const key = name === GAME_MASTER ? AVATAR_GM_KEY : name;
    const entry = game.avatarVariants?.[key];
    const showsMannequin = game.avatarsStatus !== 'ready' || entry?.sel === MANNEQUIN_VARIANT_INDEX;
    if (showsMannequin) {
        const custom = entry?.mannequin;
        if (custom) {
            return {
                url: PRESET_SHEET_URL,
                focus: circleFocusOnSheet(custom, PRESET_SHEET_SIZE),
                cardFocus: cardFocus(custom.card, PRESET_SHEET_SIZE),
                blend: true,
            };
        }
        const url = getPresetAvatarUrl(game.bots, name);
        return url ? {url, blend: true} : undefined;
    }
    const url = `/api/games/${game.id}/avatars/${encodeURIComponent(key)}?v=${avatarVersion(game, key)}`;
    const framing = entry ? candidateFraming(entry, entry.sel) : undefined;
    return {url, blend: false, ...(framing ? {focus: circleFocus(framing.circle)} : {})};
}

function candidateFraming(entry: AvatarVariantEntry, index: number): AvatarFraming | undefined {
    return entry.framing?.[String(index)];
}

/**
 * Everything the reframe editor needs for one target of a character: the
 * sheet to show and the framing on it. Undefined when the target has no
 * sheet (candidates drawn before sheets were kept, or the human player's
 * mannequin — there is no preset for them).
 */
export interface ReframeSource {
    sheetUrl: string;
    framing: AvatarFraming;
    // The framing the slicer chose — what "Reset to the drawn crop" restores.
    // For the mannequin: the assigned preset's cell.
    initial: AvatarFraming;
}

export function getReframeSource(game: Game, name: string, target: ReframeTarget): ReframeSource | undefined {
    const key = name === GAME_MASTER ? AVATAR_GM_KEY : name;
    const entry = game.avatarVariants?.[key];
    if (target === 'mannequin') {
        const initial = getPresetFraming(game.bots, name);
        if (!initial) return undefined;
        return {sheetUrl: PRESET_SHEET_URL, framing: entry?.mannequin ?? initial, initial};
    }
    const framing = entry ? candidateFraming(entry, target) : undefined;
    if (!framing) return undefined;
    return {
        sheetUrl: `/api/games/${game.id}/avatars/${avatarSheetKey(target)}?v=${game.avatarsVersion ?? 0}`,
        framing,
        initial: entry?.drawn?.[String(target)] ?? framing,
    };
}
