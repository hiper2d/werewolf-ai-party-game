/**
 * Zod schema definitions for structured AI responses
 * These provide both TypeScript types and runtime validation
 */

import { z } from 'zod';

// =============================================================================
// ZOD SCHEMAS (Primary definitions)
// =============================================================================

// Bot answer schema - the most common response format
export const BotAnswerZodSchema = z.object({
  reply: z.string().describe("The bot's response message")
});

// Game setup schema for story generation
export const GameSetupZodSchema = z.object({
  scene: z.string().describe("The vivid scene description"),
  players: z.array(z.object({
    name: z.string().describe("Single-word unique name"),
    gender: z.string().describe("male, female, or neutral"),
    story: z.string().describe("1-2 sentence character background"),
    playStyle: z.string().describe("The playstyle identifier for this character (e.g., aggressive_provoker, protective_team_player, etc.)")
  })).describe("Array of player characters")
});

// GM bot selection schema
export const GmBotSelectionZodSchema = z.object({
  selected_bots: z.array(z.string())
    .min(1, "Must select at least 1 bot")
    .max(3, "Cannot select more than 3 bots")
    .describe("Array of 1-3 bot names who should respond next"),
  reasoning: z.string().describe("Brief explanation of why these bots were selected")
});

// Bot vote schema
export const BotVoteZodSchema = z.object({
  who: z.string().describe("The name of the player you are voting to eliminate"),
  why: z.string().describe("Your reasoning for voting for this player (keep it brief but convincing)")
});

// Werewolf action schema
export const WerewolfActionZodSchema = z.object({
  target: z.string().describe("The name of the player to eliminate"),
  reasoning: z.string().describe("Reasoning for the target selection")
});

// Doctor action schema
export const DoctorActionZodSchema = z.object({
  target: z.string().describe("The name of the player to protect from werewolf attacks"),
  reasoning: z.string().describe("Reasoning for the protection choice")
});

// Detective action schema
export const DetectiveActionZodSchema = z.object({
  target: z.string().describe("The name of the player to investigate and learn their role"),
  reasoning: z.string().describe("Reasoning for the investigation choice")
});

// Night results story schema
export const NightResultsStoryZodSchema = z.object({
  story: z.string().describe("The compelling night results narrative that follows all information disclosure rules")
});

// =============================================================================
// TYPE EXPORTS (Auto-generated from Zod schemas)
// =============================================================================

export type BotAnswerZod = z.infer<typeof BotAnswerZodSchema>;
export type GameSetupZod = z.infer<typeof GameSetupZodSchema>;
export type GmBotSelectionZod = z.infer<typeof GmBotSelectionZodSchema>;
export type BotVoteZod = z.infer<typeof BotVoteZodSchema>;
export type WerewolfActionZod = z.infer<typeof WerewolfActionZodSchema>;
export type DoctorActionZod = z.infer<typeof DoctorActionZodSchema>;
export type DetectiveActionZod = z.infer<typeof DetectiveActionZodSchema>;
export type NightResultsStoryZod = z.infer<typeof NightResultsStoryZodSchema>;

// =============================================================================
// DEPRECATED JSON SCHEMA CONVERSION
// =============================================================================
// NOTE: This section has been replaced by ZodSchemaConverter in zod-schema-converter.ts
// The ZodSchemaConverter provides better provider-specific schema conversion
// and is used by all AI agents. This section is preserved for backward compatibility
// but should not be used in new code.

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates and parses a response using a Zod schema
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns Parsed and validated data
 * @throws ZodError if validation fails
 */
export function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validates a response, returning validation result
 * @param schema - The Zod schema to validate against  
 * @param data - The data to validate
 * @returns Success/error result object
 */
export function safeValidateResponse<T>(schema: z.ZodSchema<T>, data: unknown): z.SafeParseReturnType<unknown, T> {
  return schema.safeParse(data);
}

// =============================================================================
// SCHEMA REGISTRY (For dynamic schema selection)
// =============================================================================

export const ZodSchemaRegistry = {
  bot_answer: BotAnswerZodSchema,
  game_setup: GameSetupZodSchema,
  gm_bot_selection: GmBotSelectionZodSchema,
  bot_vote: BotVoteZodSchema,
  werewolf_action: WerewolfActionZodSchema,
  doctor_action: DoctorActionZodSchema,
  detective_action: DetectiveActionZodSchema,
  night_results_story: NightResultsStoryZodSchema
} as const;

export type SchemaName = keyof typeof ZodSchemaRegistry;