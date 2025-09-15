# Universal Zod Migration Strategy for All AI Providers

## Overview

This document outlines a comprehensive migration strategy to implement Zod-based schema validation across all AI providers in the werewolf game, while respecting each provider's unique schema requirements.

## Provider Analysis

### ✅ Native Schema Support (JSON Schema)
- **OpenAI GPT-5**: Supports `response_format` with JSON Schema ✓ **IMPLEMENTED**
- **Google Gemini**: Supports `responseSchema` with JSON Schema ✓
- **DeepSeek**: Supports `response_format` with JSON object ✓
- **Mistral**: Supports `response_format` with JSON Schema ✓ **IMPLEMENTED**

### ⚠️ Prompt-Based Schema Support
- **Anthropic Claude**: Requires schema description in system prompt/message ✓
- **Grok (xAI)**: OpenAI-compatible but less strict validation ✓
- **Kimi (Moonshot)**: OpenAI-compatible but less strict validation ✓

## Universal Zod Interface Design

### Core Interface

```typescript
interface UniversalZodAgent {
  // New Zod-based method - all agents will implement this
  askWithZodSchema<T>(
    zodSchema: z.ZodSchema<T>, 
    messages: AIMessage[], 
    schemaName: string
  ): Promise<[T, string, TokenUsage?]>;
  
  // Legacy method - keep for backward compatibility
  askWithSchema(
    schema: ResponseSchema, 
    messages: AIMessage[]
  ): Promise<[string, string, TokenUsage?]>;
}
```

### Schema Conversion Utilities

```typescript
// Universal schema converter - provider-agnostic
export class ZodSchemaConverter {
  // Convert Zod to JSON Schema for providers that support it
  static toJsonSchema(zodSchema: z.ZodSchema, strict: boolean = true): any
  
  // Convert Zod to descriptive text for prompt-based providers
  static toPromptDescription(zodSchema: z.ZodSchema): string
  
  // Convert Zod to provider-specific format
  static forProvider(
    zodSchema: z.ZodSchema, 
    provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'deepseek' | 'grok' | 'kimi'
  ): ProviderSchema
}
```

## Provider-Specific Implementation Strategy

### 1. OpenAI (GPT-5) ✅ **COMPLETED**
- **Status**: Fully implemented with native JSON Schema support
- **Method**: Direct Zod → JSON Schema conversion with `additionalProperties: false`
- **API**: `response_format.json_schema` with strict mode

### 2. Anthropic (Claude) 🔄 **IN PROGRESS**
- **Challenge**: No native schema support, requires prompt descriptions
- **Solution**: Generate descriptive schema text from Zod definitions
- **Implementation**:
  ```typescript
  // Convert Zod to human-readable schema description
  const schemaPrompt = ZodSchemaConverter.toPromptDescription(zodSchema);
  const fullPrompt = `${userMessage}\n\n${schemaPrompt}`;
  ```

### 3. Google (Gemini) 📋 **PLANNED**
- **Approach**: Use existing `responseSchema` with Zod → JSON Schema
- **Implementation**: Similar to OpenAI but using Google's `responseSchema` parameter

### 4. Mistral ✅ **COMPLETED**
- **Status**: Supports JSON Schema via `response_format`
- **Note**: Magistral reasoning models skip thinking tokens with JSON format (by design)

### 5. DeepSeek 📋 **PLANNED**
- **Approach**: Use `response_format: { type: 'json_object' }` for non-reasoning models
- **Challenge**: Reasoning models may need special handling

### 6. Grok (xAI) 📋 **PLANNED**
- **Approach**: OpenAI-compatible, use JSON Schema approach
- **Note**: May have less strict validation than OpenAI

### 7. Kimi (Moonshot) 📋 **PLANNED**
- **Approach**: OpenAI-compatible, use JSON Schema approach
- **Note**: Prompt-based schema instructions as fallback

## Implementation Plan

### Phase 1: Schema Conversion Utilities ⏳ **CURRENT**

Create universal schema conversion functions:

```typescript
// app/ai/zod-schema-converter.ts
export class ZodSchemaConverter {
  static toJsonSchema(zodSchema: z.ZodSchema, options: JsonSchemaOptions = {}): any {
    // Convert Zod to JSON Schema with proper additionalProperties handling
  }
  
  static toPromptDescription(zodSchema: z.ZodSchema): string {
    // Generate human-readable schema descriptions for prompt-based providers
  }
  
  static toGoogleSchema(zodSchema: z.ZodSchema): any {
    // Google-specific schema format
  }
  
  static toMistralSchema(zodSchema: z.ZodSchema): any {
    // Mistral-specific schema format (similar to OpenAI)
  }
}
```

### Phase 2: Abstract Agent Enhancement 📋 **PLANNED**

Extend `AbstractAgent` with Zod support:

```typescript
// app/ai/abstract-agent.ts
export abstract class AbstractAgent {
  // Existing method - keep for compatibility
  protected abstract doAskWithSchema(schema: ResponseSchema, messages: AIMessage[]): Promise<[string, string, TokenUsage?]>;
  
  // New Zod method - implement in each agent
  protected abstract doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[], schemaName: string): Promise<[T, string, TokenUsage?]>;
  
  // Public wrapper with validation
  async askWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[], schemaName: string): Promise<[T, string, TokenUsage?]> {
    const [rawResponse, thinking, tokenUsage] = await this.doAskWithZodSchema(zodSchema, messages, schemaName);
    
    // Universal validation using Zod (for prompt-based providers)
    const validationResult = safeValidateResponse(zodSchema, rawResponse);
    if (!validationResult.success) {
      throw new Error(`Response validation failed: ${validationResult.error.message}`);
    }
    
    return [validationResult.data, thinking, tokenUsage];
  }
}
```

### Phase 3: Provider-Specific Implementations 📋 **PLANNED**

#### 3.1 Anthropic Agent Enhancement

```typescript
// app/ai/anthropic-agent.ts
protected async doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[], schemaName: string): Promise<[string, string, TokenUsage?]> {
  // Generate schema description for prompt
  const schemaDescription = ZodSchemaConverter.toPromptDescription(zodSchema);
  
  // Modify last message to include schema instructions
  const modifiedMessages = [...messages];
  const lastMessage = modifiedMessages[modifiedMessages.length - 1];
  modifiedMessages[modifiedMessages.length - 1] = {
    ...lastMessage,
    content: `${lastMessage.content}\n\n${schemaDescription}`
  };
  
  // Use existing doAskWithSchema but return raw response for validation
  const [rawResponse, thinking, tokenUsage] = await this.doAskWithSchemaImpl(modifiedMessages);
  
  // Parse JSON response
  const parsedResponse = JSON.parse(rawResponse);
  
  return [parsedResponse, thinking, tokenUsage];
}
```

#### 3.2 Google Agent Enhancement

```typescript
// app/ai/google-agent.ts
protected async doAskWithZodSchema<T>(zodSchema: z.ZodSchema<T>, messages: AIMessage[], schemaName: string): Promise<[T, string, TokenUsage?]> {
  const jsonSchema = ZodSchemaConverter.toGoogleSchema(zodSchema);
  
  // Use existing Google API with responseSchema
  const config = {
    temperature: this.temperature,
    responseMimeType: "application/json",
    responseSchema: jsonSchema
  };
  
  // ... rest of implementation similar to existing doAskWithSchema
}
```

### Phase 4: Migration of bot-actions.ts 📋 **PLANNED**

Implement conditional usage based on agent type:

```typescript
// app/api/bot-actions.ts - Migration helper function
async function askWithBestSchema<T>(
  agent: AbstractAgent, 
  zodSchema: z.ZodSchema<T>, 
  legacySchema: ResponseSchema,
  messages: AIMessage[], 
  schemaName: string
): Promise<[T, string, TokenUsage?]> {
  // Check if agent supports Zod (has the new method)
  if ('askWithZodSchema' in agent && typeof agent.askWithZodSchema === 'function') {
    // Use new Zod approach with full type safety
    return await agent.askWithZodSchema(zodSchema, messages, schemaName);
  } else {
    // Fall back to legacy approach with manual parsing
    const [rawResponse, thinking, tokenUsage] = await agent.askWithSchema(legacySchema, messages);
    const parsed = parseResponseToObj(rawResponse);
    
    // Runtime validation using Zod
    const validationResult = safeValidateResponse(zodSchema, parsed);
    if (!validationResult.success) {
      throw new BotResponseError(
        'Response validation failed',
        validationResult.error.message,
        { agentType: agent.constructor.name },
        true
      );
    }
    
    return [validationResult.data, thinking, tokenUsage];
  }
}
```

## Schema Description Generation for Prompt-Based Providers

For providers like Anthropic that need schema descriptions in prompts, we'll generate human-readable descriptions:

```typescript
// Example: BotAnswerZodSchema
const zodSchema = z.object({
  reply: z.string().describe("The bot's response to the conversation")
});

// Generates:
"Your response must be a valid JSON object with the following structure:
{
  "reply": string // The bot's response to the conversation
}

Ensure your response is valid JSON and includes all required fields."
```

## Benefits of Universal Zod Approach

### 1. **Type Safety Everywhere**
- Full TypeScript types for all AI responses
- Compile-time type checking
- Better IDE support and autocomplete

### 2. **Runtime Validation**
- Consistent validation across all providers
- Clear error messages with field-level details
- Automatic data sanitization

### 3. **Schema Reuse**
- Single Zod schema definition works for all providers
- Convert to provider-specific formats automatically
- Maintain one source of truth

### 4. **Better Developer Experience**
- No more manual JSON parsing
- Immediate type errors for schema mismatches
- Self-documenting schemas with descriptions

### 5. **Backward Compatibility**
- Existing code continues to work unchanged
- Gradual migration path
- No breaking changes

## Migration Timeline

1. **Week 1**: Create schema conversion utilities ⏳ **CURRENT**
2. **Week 2**: Implement Anthropic and Google agents
3. **Week 3**: Implement remaining agents (DeepSeek, Grok, Kimi)
4. **Week 4**: Migrate bot-actions.ts functions gradually
5. **Week 5**: Testing and optimization

## Testing Strategy

Each agent will have comprehensive tests covering:
- Zod schema conversion accuracy
- Response validation with various data types
- Error handling for malformed responses
- Provider-specific edge cases
- Performance impact measurement

## Conclusion

This migration strategy provides a path to universal Zod adoption while respecting each AI provider's unique capabilities and constraints. The approach prioritizes type safety, maintains backward compatibility, and provides a superior developer experience across all AI integrations.