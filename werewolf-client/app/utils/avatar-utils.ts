import {AVATAR_GM_KEY, Game, GAME_MASTER, MANNEQUIN_VARIANT_INDEX, SCENE_NIGHT_KEY, SCENE_WELCOME_KEY} from "@/app/api/game-models";
import {getPresetAvatarUrl} from "@/app/utils/preset-avatars";

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
