import { z } from 'zod';

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'mistral' | 'deepseek' | 'grok' | 'kimi';

export interface JsonSchemaOptions {
  strict?: boolean;
  includeDescription?: boolean;
  additionalProperties?: boolean;
}

export interface ProviderSchema {
  type: 'json_schema' | 'prompt_description' | 'google_schema';
  content: any;
}

/**
 * Universal schema converter that transforms Zod schemas to provider-specific formats
 */
export class ZodSchemaConverter {
  /**
   * Convert Zod schema to OpenAI-compatible JSON Schema
   */
  static toOpenAIJsonSchema(zodSchema: z.ZodSchema, schemaName: string): any {
    const baseSchema = this.zodToJsonSchema(zodSchema, { strict: true });
    return {
      name: schemaName,
      schema: baseSchema,
      strict: true
    };
  }

  /**
   * Convert Zod schema to Google Gemini responseSchema format using Type constants
   * This follows the official Gemini structured output format
   */
  static toGoogleSchema(zodSchema: z.ZodSchema): any {
    return this.convertZodToGoogleType(zodSchema);
  }

  /**
   * Internal method to convert Zod types to Google Type constants
   */
  private static convertZodToGoogleType(zodType: z.ZodSchema): any {
    // Import Type dynamically to avoid import issues
    const Type = require('@google/genai').Type;
    
    // Handle ZodString
    if (zodType instanceof z.ZodString) {
      return { type: Type.STRING };
    }
    
    // Handle ZodNumber
    if (zodType instanceof z.ZodNumber) {
      return { type: Type.NUMBER };
    }
    
    // Handle ZodBoolean
    if (zodType instanceof z.ZodBoolean) {
      return { type: Type.BOOLEAN };
    }
    
    // Handle ZodArray
    if (zodType instanceof z.ZodArray) {
      return {
        type: Type.ARRAY,
        items: this.convertZodToGoogleType(zodType.element)
      };
    }
    
    // Handle ZodObject
    if (zodType instanceof z.ZodObject) {
      const properties: { [key: string]: any } = {};
      const required: string[] = [];
      const propertyOrdering: string[] = [];
      
      const shape = zodType.shape;
      for (const [key, value] of Object.entries(shape)) {
        const zodValue = value as z.ZodSchema;
        properties[key] = this.convertZodToGoogleType(zodValue);
        propertyOrdering.push(key);
        
        // Check if field is required (not optional)
        if (!zodValue.isOptional()) {
          required.push(key);
        }
      }
      
      const schema: any = {
        type: Type.OBJECT,
        properties,
        propertyOrdering
      };
      
      // Add required fields if any exist
      if (required.length > 0) {
        schema.required = required;
      }
      
      return schema;
    }
    
    // Handle ZodOptional
    if (zodType instanceof z.ZodOptional) {
      return this.convertZodToGoogleType(zodType._def.innerType);
    }
    
    // Handle ZodNullable
    if (zodType instanceof z.ZodNullable) {
      // Google Type doesn't have nullable in the same way, just return the inner type
      return this.convertZodToGoogleType(zodType._def.innerType);
    }
    
    // Handle ZodEnum
    if (zodType instanceof z.ZodEnum) {
      return {
        type: Type.STRING,
        enum: zodType.options
      };
    }
    
    // Handle ZodUnion (for simple unions)
    if (zodType instanceof z.ZodUnion) {
      // For Google, we'll use the first option as the base type
      // This is a limitation - Google doesn't support complex unions like JSON Schema
      const options = zodType._def.options;
      if (options.length > 0) {
        return this.convertZodToGoogleType(options[0]);
      }
    }
    
    // Fallback for other types
    console.warn(`Unsupported Zod type for Google schema: ${zodType.constructor.name}. Falling back to STRING.`);
    return { type: Type.STRING };
  }

  /**
   * Convert Zod schema to Mistral/DeepSeek JSON Schema format
   */
  static toMistralSchema(zodSchema: z.ZodSchema): any {
    return this.zodToJsonSchema(zodSchema, { 
      strict: true,
      additionalProperties: false 
    });
  }

  /**
   * Convert Zod schema to human-readable prompt description for Anthropic
   */
  static toPromptDescription(zodSchema: z.ZodSchema): string {
    const jsonSchema = this.zodToJsonSchema(zodSchema, { includeDescription: true });
    const description = this.buildSchemaDescription(jsonSchema, 0);
    
    return `Your response must be a valid JSON object matching this exact structure:

${description}

IMPORTANT: 
- Your response must be valid JSON
- Include all required fields
- Follow the exact data types specified
- Do not include any additional fields not specified in the schema`;
  }

  /**
   * Get provider-specific schema format
   */
  static forProvider(zodSchema: z.ZodSchema, provider: ProviderType, schemaName: string = 'response_schema'): ProviderSchema {
    switch (provider) {
      case 'openai':
        return {
          type: 'json_schema',
          content: this.toOpenAIJsonSchema(zodSchema, schemaName)
        };
      
      case 'google':
        return {
          type: 'google_schema',
          content: this.toGoogleSchema(zodSchema)
        };
      
      case 'mistral':
      case 'deepseek':
        return {
          type: 'json_schema',
          content: this.toMistralSchema(zodSchema)
        };
      
      case 'anthropic':
        return {
          type: 'prompt_description',
          content: this.toPromptDescription(zodSchema)
        };
      
      case 'grok':
      case 'kimi':
        // These are OpenAI-compatible but may need looser validation
        return {
          type: 'json_schema',
          content: this.zodToJsonSchema(zodSchema, { strict: false })
        };
      
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Core Zod to JSON Schema conversion
   */
  private static zodToJsonSchema(zodSchema: z.ZodSchema, options: JsonSchemaOptions = {}): any {
    const { strict = true, includeDescription = false, additionalProperties } = options;
    
    const converted = this.convertZodType(zodSchema, includeDescription);
    
    if (strict && converted.type === 'object') {
      return this.makeSchemaStrict(converted, additionalProperties);
    }
    
    return converted;
  }

  /**
   * Convert individual Zod types to JSON Schema format
   */
  private static convertZodType(zodType: z.ZodSchema, includeDescription: boolean = false): any {
    // Handle ZodString
    if (zodType instanceof z.ZodString) {
      const schema: any = { type: "string" };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      return schema;
    }

    // Handle ZodNumber
    if (zodType instanceof z.ZodNumber) {
      const schema: any = { type: "number" };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      return schema;
    }

    // Handle ZodBoolean
    if (zodType instanceof z.ZodBoolean) {
      const schema: any = { type: "boolean" };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      return schema;
    }

    // Handle ZodArray
    if (zodType instanceof z.ZodArray) {
      const schema: any = {
        type: "array",
        items: this.convertZodType(zodType.element, includeDescription)
      };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      
      // Add array constraints if present
      if (zodType._def.minLength !== null) {
        schema.minItems = zodType._def.minLength.value;
      }
      if (zodType._def.maxLength !== null) {
        schema.maxItems = zodType._def.maxLength.value;
      }
      
      return schema;
    }

    // Handle ZodObject
    if (zodType instanceof z.ZodObject) {
      const properties: any = {};
      const required: string[] = [];
      const shape = zodType.shape;

      for (const [key, value] of Object.entries(shape)) {
        const zodValue = value as z.ZodSchema;
        properties[key] = this.convertZodType(zodValue, includeDescription);
        
        // Check if field is required (not optional)
        if (!zodValue.isOptional()) {
          required.push(key);
        }
      }

      const schema: any = {
        type: "object",
        properties,
        required
      };

      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }

      return schema;
    }

    // Handle ZodOptional
    if (zodType instanceof z.ZodOptional) {
      return this.convertZodType(zodType._def.innerType, includeDescription);
    }

    // Handle ZodNullable
    if (zodType instanceof z.ZodNullable) {
      const innerSchema = this.convertZodType(zodType._def.innerType, includeDescription);
      return {
        ...innerSchema,
        nullable: true
      };
    }

    // Handle ZodEnum
    if (zodType instanceof z.ZodEnum) {
      const schema: any = {
        type: "string",
        enum: zodType.options
      };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      return schema;
    }

    // Handle ZodLiteral
    if (zodType instanceof z.ZodLiteral) {
      const value = zodType.value;
      const schema: any = {
        type: typeof value,
        const: value
      };
      if (includeDescription && zodType.description) {
        schema.description = zodType.description;
      }
      return schema;
    }

    // Handle ZodUnion (for simple unions)
    if (zodType instanceof z.ZodUnion) {
      const options = zodType._def.options;
      return {
        oneOf: options.map((option: z.ZodSchema) => this.convertZodType(option, includeDescription))
      };
    }

    // Fallback for other types
    console.warn(`Unsupported Zod type: ${zodType.constructor.name}. Falling back to string.`);
    return { type: "string" };
  }

  /**
   * Recursively add additionalProperties: false to all object types for strict validation
   */
  private static makeSchemaStrict(schema: any, additionalProperties: boolean = false): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    const result = { ...schema };

    // Add additionalProperties: false for object types
    if (result.type === 'object') {
      result.additionalProperties = additionalProperties;
    }

    // Recursively process properties
    if (result.properties) {
      result.properties = Object.fromEntries(
        Object.entries(result.properties).map(([key, prop]: [string, any]) => [
          key,
          this.makeSchemaStrict(prop, additionalProperties)
        ])
      );
    }

    // Recursively process array items
    if (result.items) {
      result.items = this.makeSchemaStrict(result.items, additionalProperties);
    }

    // Recursively process oneOf, anyOf, allOf
    if (result.oneOf) {
      result.oneOf = result.oneOf.map((subSchema: any) => this.makeSchemaStrict(subSchema, additionalProperties));
    }
    if (result.anyOf) {
      result.anyOf = result.anyOf.map((subSchema: any) => this.makeSchemaStrict(subSchema, additionalProperties));
    }
    if (result.allOf) {
      result.allOf = result.allOf.map((subSchema: any) => this.makeSchemaStrict(subSchema, additionalProperties));
    }

    return result;
  }

  /**
   * Build human-readable schema description for prompt-based providers
   */
  private static buildSchemaDescription(schema: any, depth: number = 0): string {
    const indent = '  '.repeat(depth);
    
    if (!schema || typeof schema !== 'object') {
      return 'any';
    }
    
    if (schema.type === 'object') {
      let result = `${indent}{\n`;
      
      const properties = schema.properties || {};
      const required = schema.required || [];
      
      const entries = Object.entries(properties);
      for (let i = 0; i < entries.length; i++) {
        const [key, prop] = entries[i] as [string, any];
        const isRequired = required.includes(key);
        const isLast = i === entries.length - 1;
        
        const typeDesc = this.getTypeDescription(prop as any, depth + 1);
        const requiredMark = isRequired ? ' (required)' : ' (optional)';
        const description = prop.description ? ` // ${prop.description}` : '';
        
        result += `${indent}  "${key}": ${typeDesc}${requiredMark}${description}`;
        if (!isLast) result += ',';
        result += '\n';
      }
      
      result += `${indent}}`;
      return result;
    }
    
    return this.getTypeDescription(schema, depth);
  }

  /**
   * Get type description for schema properties
   */
  private static getTypeDescription(schema: any, depth: number): string {
    if (schema.type === 'string') {
      if (schema.enum) {
        return `"${schema.enum.join('" | "')}"`;
      }
      return 'string';
    }
    
    if (schema.type === 'number') {
      return 'number';
    }
    
    if (schema.type === 'boolean') {
      return 'boolean';
    }
    
    if (schema.type === 'array') {
      const itemType = this.getTypeDescription(schema.items, depth);
      return `${itemType}[]`;
    }
    
    if (schema.type === 'object') {
      return this.buildSchemaDescription(schema, depth);
    }
    
    if (schema.oneOf) {
      return schema.oneOf.map((s: any) => this.getTypeDescription(s, depth)).join(' | ');
    }
    
    return schema?.type || 'any';
  }
}

/**
 * Helper function to generate schema instructions for any provider
 */
export function generateSchemaInstructions(zodSchema: z.ZodSchema, provider: ProviderType, schemaName: string = 'response'): string {
  const providerSchema = ZodSchemaConverter.forProvider(zodSchema, provider, schemaName);
  
  if (providerSchema.type === 'prompt_description') {
    return providerSchema.content;
  }
  
  // For JSON schema providers, generate basic instructions
  return `Your response must be a valid JSON object matching the provided schema. Ensure all required fields are included and data types are correct.`;
}

/**
 * Validate that a provider supports native JSON Schema
 */
export function supportsNativeJsonSchema(provider: ProviderType): boolean {
  return ['openai', 'google', 'mistral', 'deepseek'].includes(provider);
}

/**
 * Check if a provider needs prompt-based schema descriptions
 */
export function needsPromptBasedSchema(provider: ProviderType): boolean {
  return provider === 'anthropic';
}