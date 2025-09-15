/**
 * Example showing how to migrate bot-actions.ts to use Zod with GPT-5 agents
 * This demonstrates the before/after for key functions
 */

import { BotAnswerZodSchema, GmBotSelectionZodSchema, BotVoteZodSchema } from "@/app/ai/prompts/zod-schemas";
import { Gpt5Agent } from "@/app/ai/gpt-5-agent";
import type { BotAnswerZod, GmBotSelectionZod, BotVoteZod } from "@/app/ai/prompts/zod-schemas";

// =============================================================================
// EXAMPLE 1: Bot Introduction (welcomeImpl function)
// =============================================================================

// ❌ OLD WAY (current code around line 272)
async function welcomeImpl_OLD(agent: any, history: any[]) {
  const schema = createBotAnswerSchema();
  const [rawIntroduction, thinking] = await agent.askWithSchema(schema, history);
  
  if (!rawIntroduction) {
    throw new BotResponseError('Bot failed to provide introduction', '...', {}, true);
  }
  
  const answer = parseResponseToObj(rawIntroduction, 'BotAnswer'); // ❌ Manual parsing + no types
  
  return {
    reply: answer.reply,     // ❌ No type safety
    thinking: thinking || ""
  };
}

// ✅ NEW WAY (with Zod)
async function welcomeImpl_NEW(agent: Gpt5Agent, history: any[]) {
  try {
    const [answer, thinking] = await agent.askWithZodSchema(
      BotAnswerZodSchema, 
      history, 
      "bot_answer"
    );
    
    // ✅ answer is fully typed as BotAnswerZod
    // ✅ No manual parsing needed
    // ✅ Runtime validation already happened
    
    return {
      reply: answer.reply,     // ✅ TypeScript knows this is a string
      thinking: thinking || ""
    };
  } catch (error) {
    // ✅ Validation errors are caught here with clear messages
    throw new BotResponseError(
      'Bot failed to provide valid introduction',
      `Validation error: ${error}`,
      { botName: agent.name },
      true
    );
  }
}

// =============================================================================
// EXAMPLE 2: GM Bot Selection (keepBotsGoingImpl function) 
// =============================================================================

// ❌ OLD WAY (current code around line 423)
async function keepBotsGoingImpl_OLD(gmAgent: any, history: any[]) {
  const schema = createGmBotSelectionSchema();
  const [rawGmResponse, thinking] = await gmAgent.askWithSchema(schema, history);
  
  if (!rawGmResponse) {
    throw new BotResponseError('Game Master failed to select responding bots', '...', {}, true);
  }
  
  const gmResponse = parseResponseToObj(rawGmResponse); // ❌ No type checking
  
  if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
    throw new BotResponseError('Game Master provided invalid bot selection', '...', {}, true);
  }
  
  return gmResponse.selected_bots.slice(0, 3);
}

// ✅ NEW WAY (with Zod)  
async function keepBotsGoingImpl_NEW(gmAgent: Gpt5Agent, history: any[]) {
  try {
    const [gmResponse, thinking] = await gmAgent.askWithZodSchema(
      GmBotSelectionZodSchema,
      history,
      "gm_bot_selection"
    );
    
    // ✅ gmResponse is typed as GmBotSelectionZod
    // ✅ selected_bots is guaranteed to be string[] with 1-3 items (Zod validation)
    // ✅ No manual validation needed!
    
    return gmResponse.selected_bots.slice(0, 3);
  } catch (error) {
    throw new BotResponseError(
      'Game Master failed to select responding bots',
      `Validation error: ${error}`,
      { gmAiType: 'gpt-5' },
      true
    );
  }
}

// =============================================================================
// EXAMPLE 3: Bot Voting (voteImpl function)
// =============================================================================

// ❌ OLD WAY (current code around line 971)
async function voteImpl_OLD(agent: any, history: any[], alivePlayerNames: string[]) {
  const schema = createBotVoteSchema();
  const [rawVoteResponse, thinking] = await agent.askWithSchema(schema, history);
  
  if (!rawVoteResponse) {
    throw new BotResponseError('Bot failed to cast vote', '...', {}, true);
  }
  
  const voteResponse = parseResponseToObj(rawVoteResponse, 'VoteMessage');
  
  // ❌ Manual validation needed
  if (!alivePlayerNames.includes(voteResponse.who)) {
    throw new BotResponseError(`Invalid vote target: ${voteResponse.who}`, '...', {}, true);
  }
  
  return voteResponse;
}

// ✅ NEW WAY (with Zod)
async function voteImpl_NEW(agent: Gpt5Agent, history: any[], alivePlayerNames: string[]) {
  try {
    const [voteResponse, thinking] = await agent.askWithZodSchema(
      BotVoteZodSchema,
      history,
      "bot_vote"
    );
    
    // ✅ voteResponse is typed as BotVoteZod
    // ✅ who and why are guaranteed to be strings
    
    // Still need business logic validation (Zod can't know game rules)
    if (!alivePlayerNames.includes(voteResponse.who)) {
      throw new BotResponseError(
        `Invalid vote target: ${voteResponse.who}`,
        `Valid targets: ${alivePlayerNames.join(', ')}`,
        { validTargets: alivePlayerNames },
        true
      );
    }
    
    return voteResponse;
  } catch (error) {
    throw new BotResponseError(
      'Bot failed to cast valid vote',
      `Validation error: ${error}`,
      { botName: agent.name },
      true
    );
  }
}

// =============================================================================
// MIGRATION STRATEGY FOR EXISTING CODE
// =============================================================================

/**
 * Step-by-step migration guide:
 * 
 * 1. IDENTIFY USAGE PATTERNS
 *    Look for: agent.askWithSchema(schema, history)
 *    Found in: welcomeImpl, processNextBotInQueue, keepBotsGoingImpl, handleHumanPlayerMessage, voteImpl, getSuggestionImpl
 * 
 * 2. CHECK AGENT TYPE
 *    Only GPT-5 agents can use askWithZodSchema currently
 *    Other agents (Anthropic, Google, etc.) continue using old method
 * 
 * 3. REPLACE PATTERN
 *    From: const [rawResponse, thinking] = await agent.askWithSchema(schema, history);
 *          const parsed = parseResponseToObj(rawResponse, 'TypeName');
 *    
 *    To:   const [response, thinking] = await agent.askWithZodSchema(ZodSchema, history, "schema_name");
 * 
 * 4. UPDATE ERROR HANDLING
 *    Zod validation errors are more descriptive
 *    Catch and wrap them in BotResponseError with better context
 * 
 * 5. REMOVE MANUAL VALIDATION
 *    Let Zod handle structure validation
 *    Keep business logic validation (like valid vote targets)
 */

// =============================================================================
// CONDITIONAL USAGE EXAMPLE
// =============================================================================

/**
 * Since not all agents support Zod yet, you might want conditional usage:
 */
async function hybridApproach(agent: any, schema: any, zodSchema: any, history: any[], schemaName: string) {
  // Check if agent supports Zod (GPT-5 agents)
  if (agent instanceof Gpt5Agent && 'askWithZodSchema' in agent) {
    // Use new Zod approach
    const [response, thinking] = await agent.askWithZodSchema(zodSchema, history, schemaName);
    return [response, thinking]; // Fully typed response
  } else {
    // Fall back to old approach  
    const [rawResponse, thinking] = await agent.askWithSchema(schema, history);
    const response = parseResponseToObj(rawResponse);
    return [response, thinking]; // Untyped response
  }
}

export {
  welcomeImpl_NEW,
  keepBotsGoingImpl_NEW,
  voteImpl_NEW,
  hybridApproach
};