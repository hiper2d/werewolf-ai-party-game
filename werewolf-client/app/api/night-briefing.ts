import { gameText, GameTextSource } from "@/app/ai/game-language";

/**
 * The bullet list of night roles the Game Master posts when night falls, in the
 * game's language.
 *
 * The English list is GAME_TEXT_EN.night_briefing, built from ROLE_CONFIGS in night
 * order. A role's `description` covers only its routine action, so the one-time
 * abilities are appended from `oneTimeAbilities` — without them the briefing was the
 * one place in the game that never mentioned the Doctor's Mistake or the Detective's
 * Kill, even though the rules page and every bot's system prompt both do.
 */
export function buildNightRoleBriefing(game?: GameTextSource): string {
    return gameText(game, 'night_briefing');
}
