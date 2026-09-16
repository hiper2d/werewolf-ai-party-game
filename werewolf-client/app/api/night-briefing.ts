import { ROLE_CONFIGS } from "@/app/api/game-models";

/**
 * The bullet list of night roles the Game Master posts when night falls.
 *
 * Extracted from beginNight so it can be tested without Firestore or an LLM.
 * A role's `description` covers only its routine action, so the one-time
 * abilities are appended from `oneTimeAbilities` — without them the briefing
 * was the one place in the game that never mentioned the Doctor's Mistake or
 * the Detective's Kill, even though the rules page and every bot's system
 * prompt both do.
 */
export function buildNightRoleBriefing(): string {
    return Object.values(ROLE_CONFIGS)
        .filter(config => config && config.hasNightAction)
        .sort((a, b) => (a.nightActionOrder ?? 999) - (b.nightActionOrder ?? 999))
        .map(config => {
            const oneTime = Object.values(config.oneTimeAbilities ?? {}).map(ability => ability.description);
            const suffix = oneTime.length > 0 ? ` Once per game: ${oneTime.join('; ')}.` : '';
            return `• ${config.name}: ${config.description}.${suffix}`;
        })
        .join('\n');
}
