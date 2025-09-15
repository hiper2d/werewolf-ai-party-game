/**
 * Demo showing how to use the new Zod integration with GPT-5 agent
 * This demonstrates the benefits over the old JSON schema approach
 */

import { Gpt5Agent } from './gpt-5-agent';
import { BotAnswerZodSchema, GameSetupZodSchema } from './prompts/zod-schemas';
import { LLM_CONSTANTS, SupportedAiModels } from './ai-models';

// Example usage of the new Zod-powered GPT-5 agent
export async function demonstrateZodIntegration() {
  // Create agent (same as before)
  const agent = new Gpt5Agent(
    "DemoBot",
    "You are a helpful assistant in a werewolf game.",
    SupportedAiModels[LLM_CONSTANTS.GPT_5].modelApiName,
    process.env.OPENAI_API_KEY!,
    0.7,
    true // Enable thinking
  );

  console.log("🚀 Demonstrating Zod Integration with GPT-5");
  
  try {
    // OLD WAY (still works for backward compatibility)
    console.log("\n📜 OLD APPROACH: Manual JSON Schema");
    const oldSchema = {
      type: 'object',
      properties: {
        reply: { type: 'string', description: "Bot's response" }
      },
      required: ['reply'],
      additionalProperties: false
    };
    
    const [oldResponse] = await agent.doAskWithSchema(oldSchema, [{
      role: 'user',
      content: 'Say hello briefly.'
    }]);
    
    console.log("Old response (untyped):", JSON.parse(oldResponse));
    
    // NEW WAY (with Zod)
    console.log("\n✨ NEW APPROACH: Zod Schema with Runtime Validation");
    
    const [typedResponse, thinking, tokenUsage] = await agent.askWithZodSchema(
      BotAnswerZodSchema,
      [{ role: 'user', content: 'Say hello briefly.' }],
      "bot_answer"
    );
    
    // Response is now fully typed!
    console.log("New response (typed):", typedResponse.reply);
    console.log("Thinking content length:", thinking.length);
    console.log("Token usage:", tokenUsage);
    
    // Complex nested schema example
    console.log("\n🎯 COMPLEX SCHEMA: Game Setup");
    
    const [gameSetup] = await agent.askWithZodSchema(
      GameSetupZodSchema,
      [{ 
        role: 'user', 
        content: 'Create a werewolf game setup with 3 players in a spooky forest.' 
      }],
      "game_setup"
    );
    
    // Fully typed nested object with IntelliSense!
    console.log("Scene:", gameSetup.scene);
    console.log("Players:");
    gameSetup.players.forEach((player, i) => {
      console.log(`  ${i + 1}. ${player.name} (${player.gender}) - ${player.playStyle}`);
      console.log(`     ${player.story}`);
    });
    
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

// Benefits summary
export const ZOD_BENEFITS = {
  "Runtime Validation": "Responses are validated against schema, catching errors early",
  "Type Safety": "Full TypeScript types generated automatically from schemas",
  "Better DX": "IntelliSense, auto-completion, and compile-time error checking",
  "No Schema Errors": "No more 'additionalProperties' issues with complex nested objects",
  "Single Source of Truth": "One schema definition for both validation and types",
  "Backward Compatible": "Old JSON schema approach still works alongside Zod",
  "OpenAI Optimized": "Native support for OpenAI's structured output requirements"
} as const;

// Usage examples for other developers
export const USAGE_EXAMPLES = {
  // Simple schema
  simple: `
import { BotAnswerZodSchema } from './prompts/zod-schemas';

const [response] = await gpt5Agent.askWithZodSchema(
  BotAnswerZodSchema,
  messages,
  "bot_answer"
);

// response.reply is fully typed as string
console.log(response.reply);
  `,
  
  // Complex nested schema
  complex: `
import { GameSetupZodSchema } from './prompts/zod-schemas';

const [gameSetup] = await gpt5Agent.askWithZodSchema(
  GameSetupZodSchema,
  messages, 
  "game_setup"
);

// Fully typed nested structure
gameSetup.players.forEach(player => {
  console.log(player.name); // TypeScript knows this is a string
  console.log(player.story); // IntelliSense works perfectly
});
  `,
  
  // Custom schema
  custom: `
import { z } from 'zod';

// Define custom schema
const CustomSchema = z.object({
  decision: z.enum(["yes", "no"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

const [result] = await gpt5Agent.askWithZodSchema(
  CustomSchema,
  messages,
  "custom_decision"
);

// result.decision is typed as "yes" | "no"
// result.confidence is typed as number
// All validated at runtime!
  `
} as const;