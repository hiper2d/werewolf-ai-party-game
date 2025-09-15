import { z } from 'zod';
import { ZodSchemaConverter, ProviderType, supportsNativeJsonSchema, needsPromptBasedSchema } from './zod-schema-converter';

describe('ZodSchemaConverter', () => {
  // Test schemas
  const simpleSchema = z.object({
    reply: z.string().describe("The bot's response message"),
    confidence: z.number().optional().describe("Confidence level from 0 to 1")
  });

  const complexSchema = z.object({
    selected_bots: z.array(z.string()).min(1).max(3).describe("List of selected bot names"),
    reasoning: z.string().describe("Explanation for the selection"),
    priority: z.enum(["high", "medium", "low"]).describe("Priority level"),
    metadata: z.object({
      timestamp: z.number(),
      source: z.string()
    }).optional()
  });

  const voteSchema = z.object({
    who: z.string().describe("The player being voted for"),
    why: z.string().describe("Reason for the vote"),
    certainty: z.boolean().describe("Whether the vote is certain")
  });

  describe('OpenAI Schema Conversion', () => {
    it('should convert simple schema to OpenAI format', () => {
      const result = ZodSchemaConverter.toOpenAIJsonSchema(simpleSchema, 'bot_reply');
      
      expect(result).toEqual({
        name: 'bot_reply',
        schema: {
          type: 'object',
          properties: {
            reply: {
              type: 'string',
              description: "The bot's response message"
            },
            confidence: {
              type: 'number',
              description: "Confidence level from 0 to 1"
            }
          },
          required: ['reply'],
          additionalProperties: false
        },
        strict: true
      });
    });

    it('should handle complex nested schemas', () => {
      const result = ZodSchemaConverter.toOpenAIJsonSchema(complexSchema, 'gm_selection');
      
      expect(result.schema.type).toBe('object');
      expect(result.schema.properties.selected_bots.type).toBe('array');
      expect(result.schema.properties.selected_bots.items.type).toBe('string');
      expect(result.schema.properties.selected_bots.minItems).toBe(1);
      expect(result.schema.properties.selected_bots.maxItems).toBe(3);
      expect(result.schema.properties.priority.enum).toEqual(['high', 'medium', 'low']);
      expect(result.schema.properties.metadata.type).toBe('object');
      expect(result.schema.additionalProperties).toBe(false);
    });
  });

  describe('Google Schema Conversion', () => {
    it('should convert to Google Gemini format', () => {
      const result = ZodSchemaConverter.toGoogleSchema(simpleSchema);
      
      expect(result.type).toBe('object');
      expect(result.properties.reply.description).toBe("The bot's response message");
      expect(result.properties.confidence.description).toBe("Confidence level from 0 to 1");
      expect(result.additionalProperties).toBe(false);
    });

    it('should include descriptions for Google', () => {
      const result = ZodSchemaConverter.toGoogleSchema(complexSchema);
      
      expect(result.properties.selected_bots.description).toBe("List of selected bot names");
      expect(result.properties.reasoning.description).toBe("Explanation for the selection");
      expect(result.properties.priority.description).toBe("Priority level");
    });
  });

  describe('Mistral/DeepSeek Schema Conversion', () => {
    it('should convert to Mistral format', () => {
      const result = ZodSchemaConverter.toMistralSchema(voteSchema);
      
      expect(result.type).toBe('object');
      expect(result.additionalProperties).toBe(false);
      expect(result.required).toEqual(['who', 'why', 'certainty']);
      expect(result.properties.who.type).toBe('string');
      expect(result.properties.certainty.type).toBe('boolean');
    });
  });

  describe('Anthropic Prompt Description', () => {
    it('should generate human-readable schema description', () => {
      const result = ZodSchemaConverter.toPromptDescription(simpleSchema);
      
      expect(result).toContain('Your response must be a valid JSON object');
      expect(result).toContain('"reply": string (required)');
      expect(result).toContain('"confidence": number (optional)');
      expect(result).toContain("The bot's response message");
      expect(result).toContain("Confidence level from 0 to 1");
      expect(result).toContain('IMPORTANT:');
      expect(result).toContain('valid JSON');
    });

    it('should handle complex schemas with arrays and enums', () => {
      const result = ZodSchemaConverter.toPromptDescription(complexSchema);
      
      expect(result).toContain('"selected_bots": string[] (required)');
      expect(result).toContain('"priority": "high" | "medium" | "low" (required)');
      expect(result).toContain('"metadata": {');
      expect(result).toContain('"timestamp": number (required)');
      expect(result).toContain('"source": string (required)');
      expect(result).toContain('} (optional)');
    });

    it('should generate readable nested object descriptions', () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().describe("User's full name"),
          age: z.number().describe("User's age"),
          preferences: z.object({
            theme: z.enum(["dark", "light"]).describe("UI theme preference"),
            notifications: z.boolean().describe("Whether notifications are enabled")
          }).describe("User preferences")
        }).describe("User information"),
        action: z.string().describe("Action to perform")
      });

      const result = ZodSchemaConverter.toPromptDescription(nestedSchema);
      
      expect(result).toContain('"user": {');
      expect(result).toContain('"preferences": {');
      expect(result).toContain('"theme": "dark" | "light"');
      expect(result).toContain('User information');
      expect(result).toContain('UI theme preference');
    });
  });

  describe('Provider-Specific Conversion', () => {
    it('should return correct format for each provider', () => {
      const providers: ProviderType[] = ['openai', 'anthropic', 'google', 'mistral', 'deepseek', 'grok', 'kimi'];
      
      providers.forEach(provider => {
        const result = ZodSchemaConverter.forProvider(simpleSchema, provider, 'test_schema');
        
        switch (provider) {
          case 'openai':
            expect(result.type).toBe('json_schema');
            expect(result.content.name).toBe('test_schema');
            expect(result.content.strict).toBe(true);
            break;
          
          case 'anthropic':
            expect(result.type).toBe('prompt_description');
            expect(typeof result.content).toBe('string');
            expect(result.content).toContain('valid JSON object');
            break;
          
          case 'google':
            expect(result.type).toBe('google_schema');
            expect(result.content.type).toBe('object');
            break;
          
          case 'mistral':
          case 'deepseek':
            expect(result.type).toBe('json_schema');
            expect(result.content.additionalProperties).toBe(false);
            break;
          
          case 'grok':
          case 'kimi':
            expect(result.type).toBe('json_schema');
            expect(result.content.type).toBe('object');
            // These should be less strict
            break;
        }
      });
    });

    it('should throw error for unsupported provider', () => {
      expect(() => {
        ZodSchemaConverter.forProvider(simpleSchema, 'unsupported' as ProviderType);
      }).toThrow('Unsupported provider: unsupported');
    });
  });

  describe('Schema Type Detection', () => {
    it('should correctly identify native JSON schema support', () => {
      expect(supportsNativeJsonSchema('openai')).toBe(true);
      expect(supportsNativeJsonSchema('google')).toBe(true);
      expect(supportsNativeJsonSchema('mistral')).toBe(true);
      expect(supportsNativeJsonSchema('deepseek')).toBe(true);
      expect(supportsNativeJsonSchema('anthropic')).toBe(false);
      expect(supportsNativeJsonSchema('grok')).toBe(false);
      expect(supportsNativeJsonSchema('kimi')).toBe(false);
    });

    it('should correctly identify prompt-based schema needs', () => {
      expect(needsPromptBasedSchema('anthropic')).toBe(true);
      expect(needsPromptBasedSchema('openai')).toBe(false);
      expect(needsPromptBasedSchema('google')).toBe(false);
      expect(needsPromptBasedSchema('mistral')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const emptySchema = z.object({});
      const result = ZodSchemaConverter.toOpenAIJsonSchema(emptySchema, 'empty');
      
      expect(result.schema.properties).toEqual({});
      expect(result.schema.required).toEqual([]);
    });

    it('should handle all optional fields', () => {
      const optionalSchema = z.object({
        field1: z.string().optional(),
        field2: z.number().optional(),
        field3: z.boolean().optional()
      });
      
      const result = ZodSchemaConverter.toOpenAIJsonSchema(optionalSchema, 'optional');
      expect(result.schema.required).toEqual([]);
    });

    it('should handle nullable fields', () => {
      const nullableSchema = z.object({
        nullable_field: z.string().nullable(),
        regular_field: z.string()
      });
      
      const result = ZodSchemaConverter.toGoogleSchema(nullableSchema);
      expect(result.properties.nullable_field.nullable).toBe(true);
      expect(result.properties.regular_field.nullable).toBeUndefined();
    });

    it('should handle literal values', () => {
      const literalSchema = z.object({
        type: z.literal("user_message"),
        value: z.string()
      });
      
      const result = ZodSchemaConverter.toOpenAIJsonSchema(literalSchema, 'literal');
      expect(result.schema.properties.type.const).toBe("user_message");
      expect(result.schema.properties.type.type).toBe("string");
    });

    it('should handle union types', () => {
      const unionSchema = z.object({
        status: z.union([z.literal("success"), z.literal("error"), z.literal("pending")]),
        message: z.string()
      });
      
      const result = ZodSchemaConverter.toGoogleSchema(unionSchema);
      expect(result.properties.status.oneOf).toBeDefined();
      expect(result.properties.status.oneOf).toHaveLength(3);
    });
  });

  describe('Schema Validation', () => {
    it('should produce schemas that validate against expected data', () => {
      const testData = {
        reply: "Hello, I'm a bot!",
        confidence: 0.85
      };
      
      const result = simpleSchema.safeParse(testData);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.reply).toBe("Hello, I'm a bot!");
        expect(result.data.confidence).toBe(0.85);
      }
    });

    it('should reject invalid data', () => {
      const invalidData = {
        reply: 123, // Should be string
        confidence: "high" // Should be number
      };
      
      const result = simpleSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should handle missing required fields', () => {
      const incompleteData = {
        confidence: 0.7
        // Missing required 'reply' field
      };
      
      const result = simpleSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
    });

    it('should allow missing optional fields', () => {
      const minimalData = {
        reply: "Hello!"
        // Missing optional 'confidence' field
      };
      
      const result = simpleSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.reply).toBe("Hello!");
        expect(result.data.confidence).toBeUndefined();
      }
    });
  });
});