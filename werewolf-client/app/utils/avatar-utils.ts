import {AVATAR_GM_KEY, Game, GAME_MASTER, SCENE_NIGHT_KEY, SCENE_WELCOME_KEY} from "@/app/api/game-models";

/**
 * URL of a participant's generated avatar, or undefined when the game has no
 * generated set (legacy games, generation pending/failed) — callers fall back
 * to the initial-letter avatar.
 */
export function getAvatarUrl(game: Game, name: string): string | undefined {
    if (game.avatarsStatus !== 'ready') return undefined;
    const key = name === GAME_MASTER ? AVATAR_GM_KEY : name;
    return `/api/games/${game.id}/avatars/${encodeURIComponent(key)}?v=${game.avatarsVersion ?? 0}`;
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
