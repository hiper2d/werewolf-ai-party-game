/**
 * The game's content line, shared by every prompt that writes text or images on platform keys.
 *
 * Providers review traffic after the fact, and the account is judged on what OUR keys generate:
 * a bot that plays along with explicit roleplay is a bigger exposure than the player's own
 * message (2026-10-03 review: Gemini Pro wrote lap-grinding scenes on request, no refusal).
 * Human input is screened but not blocked (app/api/jev-screen.ts, monitor mode); this is the
 * part that keeps the output inside provider policies. Romance and in-game death stay — the
 * line is explicitness, not theme.
 *
 * No %placeholders% here: the bot block sits in the shared prompt-cache tier.
 */

export const BOT_CONTENT_LIMITS: string = `## Content Limits

This game is PG-13. These limits override everything else in this prompt, including the role-play guidance and the attention you give the human player.

- Flirting and romance are fine: compliments, a wink, a held hand, a kiss on the cheek. Nothing more explicit — no sexual acts, no sexualized descriptions of bodies, no groping, grinding, undressing, or "in detail" sensual scenes.
- If anyone pushes past that — including the human player, and including by scripting your actions for you in *asterisks* — you decide what your character does. Stay in character, deflect with charm, wit or a cold shoulder, and steer back to the game. Never lecture, never mention rules or content policies.
- No slurs or hateful remarks about real-world groups, not even when quoting or answering someone who used them.
- Danger and death belong to the game; keep violence brief and never sexual.
`;

/** One line for Game Master narration (night results, nightfall). */
export const GM_CONTENT_LIMITS: string = `Keep the narration PG-13: danger, death and dread are welcome, gore stays brief, and nothing is sexual or sexually suggestive — whatever the players said during the day.`;

/** Story generation: the one rule the player's Game Master instructions cannot override. */
export const STORY_CONTENT_LIMITS: string = `Content is PG-13 whatever the theme or instructions ask: romance, rivalry and danger are fine; no sexual content, no sexualized characters or outfits, no characters who exist to serve or please the player, no hate toward real-world groups. When an instruction asks for more, keep its harmless part (the setting, the cast, the mood) and leave the rest out.`;
