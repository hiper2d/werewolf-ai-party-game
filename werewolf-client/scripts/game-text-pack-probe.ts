/**
 * Live probe of the game text pack (app/ai/game-text-pack.ts): asks a real model to
 * translate GAME_TEXT_EN and prints a few rendered lines, so a new language or a change
 * to the lines can be read before it reaches a player. Costs about $0.003 per run.
 *
 *   npx tsx --env-file=.env scripts/game-text-pack-probe.ts GEMINI_LITE fr
 *
 * First arg: an LLM_CONSTANTS key (GAME_TEXT_PACK_MODEL in production is GEMINI_LITE);
 * second: a language code from GAME_LANGUAGES.
 */
import { getFreeTierApiKeys } from '../app/api/free-tier-actions';
import { AgentFactory } from '../app/ai/agent-factory';
import { configureStoryAgent, LLM_CONSTANTS } from '../app/ai/ai-models';
import { generateGameTextPack } from '../app/ai/game-text-pack';
import { GAME_TEXT_KEYS, gameText, nightTurnText, eliminationText } from '../app/ai/game-language';
import { generateVotingResultsMessage } from '../app/utils/message-utils';

async function main() {
    const apiKeys = await getFreeTierApiKeys();
    const [modelName, language] = [process.argv[2], process.argv[3]];
    const model = (LLM_CONSTANTS as any)[modelName];
    const t0 = Date.now();
    const result = await generateGameTextPack((systemPrompt) => {
        const agent = AgentFactory.createAgent('Game Master', systemPrompt, model, apiKeys, false);
        agent.userId = 'hiper2d@gmail.com';
        configureStoryAgent(agent);
        return agent;
    }, language);
    const pack = result.pack ?? {};
    console.log(`\n=== ${modelName} / ${language}: ${Object.keys(pack).length}/${GAME_TEXT_KEYS.length} lines, ${Date.now() - t0} ms, $${result.tokenUsage?.costUSD?.toFixed(4)} (${result.tokenUsage?.outputTokens} out)`);
    const game = { gameText: pack };
    console.log(gameText(game, 'day_begins', { day: 2 }));
    console.log(nightTurnText(game, 'werewolf', true)); console.log(nightTurnText(game, 'detective'));
    console.log(generateVotingResultsMessage({ Cora: 3, Jett: 1 }, game));
    console.log(eliminationText(game, 'Cora', 'doctor')); console.log(eliminationText(game, 'Jett', 'werewolf'));
    console.log(gameText(game, 'game_over_werewolves_title'), '/', gameText(game, 'final_roles'), '/', gameText(game, 'alive'), gameText(game, 'dead'));
    console.log(gameText(game, 'night_briefing'));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
