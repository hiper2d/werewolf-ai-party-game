/**
 * Translates the code-written game lines (GAME_TEXT_EN) into the game's language, once,
 * at preview time, on the Game Master model. The result is stored on the game doc as
 * `gameText` and read through gameText() — see game-language.ts for the design.
 *
 * Best effort by design: the preview never fails because of the pack. Any error, or a
 * line that lost its placeholders, leaves that line English (warn log).
 */
import { z } from 'zod';
import type { AbstractAgent, TokenUsage } from '@hiper2d/ai-agents';
import { GAME_TEXT_EN, GAME_TEXT_KEYS, GameTextPack, gameLanguageName, isEnglish, validateGameTextPack } from '@/app/ai/game-language';
import { logger } from '@/app/utils/logger';

export interface GameTextPackResult {
    pack?: GameTextPack;
    tokenUsage?: TokenUsage;
}

const GAME_TEXT_PACK_SYSTEM_PROMPT = `\
You translate the fixed lines a Werewolf party game's Game Master posts in the chat: phase headers, vote results, role reveals, rule reminders. The players will read your lines as the game's own voice.

Rules:
- Translate every line into the requested language. Natural, idiomatic, the register of a game master addressing players — not a word-for-word gloss.
- Keep every {placeholder} exactly as it is (same spelling, same braces); it is filled with a player's name, a number or a role name at runtime. A line's placeholders must all survive.
- Keep the emoji and the markdown markers (**bold**, *italics*, bullets, line breaks) in place.
- Translate the role names too, using the word that language's version of the game uses: the werewolf (French loup-garou, German Werwolf, Spanish hombre lobo, Japanese 人狼, Russian оборотень), and likewise the doctor, the detective, the maniac and the villager. Never leave a role name in English — not inside a sentence and not as a bullet label — and use the same word for a role in every line.
- Return a JSON object with exactly the same keys as the input, each value the translated line. No extra keys, no commentary.`;

/** One string per GAME_TEXT_EN key — fixed keys so every provider's structured output accepts it. */
const GameTextPackZodSchema = z.object(
    Object.fromEntries(GAME_TEXT_KEYS.map(key => [key, z.string()])) as Record<keyof typeof GAME_TEXT_EN, z.ZodString>
);

/**
 * Asks the agent for the pack. English needs none (returns {}). Runs alongside the story
 * pipeline on the preview, so its latency is hidden behind the character sheets.
 */
export async function generateGameTextPack(createAgent: (systemPrompt: string) => AbstractAgent, language: string): Promise<GameTextPackResult> {
    if (isEnglish(language)) return {};
    const name = gameLanguageName(language);
    const agent = createAgent(GAME_TEXT_PACK_SYSTEM_PROMPT);
    try {
        const [raw, , tokenUsage] = await agent.askWithZodSchema(GameTextPackZodSchema, [{
            role: 'user',
            content: `Translate into ${name}. Input (English):\n${JSON.stringify(GAME_TEXT_EN, null, 2)}`,
        }]);
        const { pack, dropped } = validateGameTextPack(raw as Record<string, unknown>);
        if (dropped.length > 0) {
            logger.warn(`Game text pack (${name}): ${dropped.length} of ${GAME_TEXT_KEYS.length} lines dropped, English fallback for them`, { language, dropped, model: agent.name });
        }
        return { pack: Object.keys(pack).length > 0 ? pack : undefined, tokenUsage };
    } catch (error: any) {
        logger.warn(`Game text pack (${name}) failed; the fixed lines stay English`, { language, model: agent.name, error: error?.message });
        return {};
    }
}
