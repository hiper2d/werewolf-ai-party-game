/**
 * Zod schema definitions for structured AI responses
 * These provide both TypeScript types and runtime validation
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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
// JSON SCHEMA CONVERSION (For non-OpenAI providers)
// =============================================================================

/**
 * Converts a Zod schema to JSON Schema format for APIs that don't support Zod natively
 * @param zodSchema - The Zod schema to convert
 * @returns JSON Schema object
 */
export function zodToJsonSchemaCustom(zodSchema: z.ZodSchema): any {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    // Use more descriptive names
    $refStrategy: 'none'
  });
  
  // Recursively add additionalProperties: false to all object types
  return addAdditionalPropertiesFalse(jsonSchema);
}

/**
 * Recursively adds additionalProperties: false to all object types in a JSON schema
 */
function addAdditionalPropertiesFalse(schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Add additionalProperties: false for object types
  if (result.type === 'object') {
    result.additionalProperties = false;
  }

  // Recursively process properties
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, prop]: [string, any]) => [
        key,
        addAdditionalPropertiesFalse(prop)
      ])
    );
  }

  // Recursively process array items
  if (result.items) {
    result.items = addAdditionalPropertiesFalse(result.items);
  }

  // Recursively process oneOf, anyOf, allOf
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((subSchema: any) => addAdditionalPropertiesFalse(subSchema));
  }
  if (result.anyOf) {
    result.anyOf = result.anyOf.map((subSchema: any) => addAdditionalPropertiesFalse(subSchema));
  }
  if (result.allOf) {
    result.allOf = result.allOf.map((subSchema: any) => addAdditionalPropertiesFalse(subSchema));
  }

  return result;
}

// Pre-converted JSON schemas for backward compatibility
export const BotAnswerJsonSchema = zodToJsonSchemaCustom(BotAnswerZodSchema);
export const GameSetupJsonSchema = zodToJsonSchemaCustom(GameSetupZodSchema);
export const GmBotSelectionJsonSchema = zodToJsonSchemaCustom(GmBotSelectionZodSchema);
export const BotVoteJsonSchema = zodToJsonSchemaCustom(BotVoteZodSchema);
export const WerewolfActionJsonSchema = zodToJsonSchemaCustom(WerewolfActionZodSchema);
export const DoctorActionJsonSchema = zodToJsonSchemaCustom(DoctorActionZodSchema);
export const DetectiveActionJsonSchema = zodToJsonSchemaCustom(DetectiveActionZodSchema);
export const NightResultsStoryJsonSchema = zodToJsonSchemaCustom(NightResultsStoryZodSchema);

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