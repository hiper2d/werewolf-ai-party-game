import { z } from 'zod';

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
