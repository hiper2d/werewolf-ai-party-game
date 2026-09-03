/**
 * One-off live check for the ModelInvalidResponseError flow (ai-agents 0.1.3):
 * runs the real stage-1 casting ask against gpt-5.6-luna with a deliberately tiny
 * output cap so the response truncates, and asserts the typed error (not a raw JSON
 * SyntaxError or the generic API wrap) comes back carrying the message the newgame
 * page string-matches on.
 *
 * Run: npx tsx scripts/test-invalid-response-error.ts
 */

import { db } from '../firebase/server';
import { Gpt5Agent, ModelInvalidResponseError } from '@hiper2d/ai-agents';
import { GameCastingZodSchema } from '../app/ai/prompts/zod-schemas';
import { CASTING_SYSTEM_PROMPT, CASTING_USER_PROMPT } from '../app/ai/prompts/story-gen-prompts';
import { format } from '../app/ai/prompts/utils';

async function main() {
    if (!db) throw new Error('Firestore is not initialized');
    const doc = (await db.collection('config').doc('freeTierApiKeys').get()).data();
    const apiKey = doc?.keys?.OPENAI_API_KEY;
    if (!apiKey) throw new Error('No OPENAI_API_KEY in config/freeTierApiKeys');

    const prompt = format(CASTING_USER_PROMPT, {
        theme: 'AI companies CEO',
        description: 'Everybody wakes up in a bunker after AI took over and destroyed the world',
        number_of_players: 10,
        excluded_name: 'Sam',
        game_roles: '- **Werewolf** (evil): eliminates players at night',
        werewolf_count: 3,
        available_voices: 'any',
    });

    const agent = new Gpt5Agent('StoryTest', CASTING_SYSTEM_PROMPT, 'gpt-5.6-luna', apiKey, 1);
    agent.maxOutputTokens = 100; // force truncation: reasoning alone eats this

    try {
        await agent.askWithZodSchema(GameCastingZodSchema, [{ role: 'user', content: prompt } as any]);
        console.log('✗ UNEXPECTED: the truncated ask succeeded');
        process.exit(1);
    } catch (err: any) {
        console.log('Caught:', err.constructor.name);
        console.log('Message:', err.message);
        const typed = err instanceof ModelInvalidResponseError;
        const uiMatch = err.message.includes('failed to produce a valid response');
        console.log('instanceof ModelInvalidResponseError:', typed, '| truncated flag:', err.truncated);
        console.log('newgame page branch would match:', uiMatch);
        process.exit(typed && uiMatch ? 0 : 1);
    }
}

main();
