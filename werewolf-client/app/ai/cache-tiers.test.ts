/**
 * Pins BOT_SYSTEM_PROMPT's cache-tier contract: the shared tier above CACHE_TIER_MARKER is
 * byte-identical across bots (no placeholders), so provider prompt caches hit across the
 * lobby. The marker/agent plumbing itself is tested in @hiper2d/ai-agents.
 */
import { BOT_SYSTEM_PROMPT, CACHE_TIER_MARKER } from './prompts/bot-prompts';
import { format } from './prompts/utils';

const IDENTITY_PARAMS = {
    name: 'TestBot',
    personal_story: 'A test story',
    role: 'villager',
    werewolf_teammates_section: '',
    human_player_name: 'Alice',
    players_names: ['A', 'B'],
    dead_players_names_with_roles: 'None',
    bot_context: ''
};

describe('BOT_SYSTEM_PROMPT cache tiers', () => {
    it('keeps all placeholders below the cache tier marker', () => {
        const [sharedTier, ...rest] = BOT_SYSTEM_PROMPT.split(CACHE_TIER_MARKER);
        expect(rest.length).toBe(1); // exactly one marker
        expect(sharedTier).not.toMatch(/%\w+%/); // shared tier is bot-independent
        expect(rest[0]).toMatch(/%name%/);
        expect(rest[0]).toMatch(/%bot_context%/);
    });

    it('shared tier is byte-identical across differently formatted bots', () => {
        const promptA = format(BOT_SYSTEM_PROMPT, IDENTITY_PARAMS);
        const promptB = format(BOT_SYSTEM_PROMPT, { ...IDENTITY_PARAMS, name: 'OtherBot', personal_story: 'Another story' });
        expect(promptA.split(CACHE_TIER_MARKER)[0]).toBe(promptB.split(CACHE_TIER_MARKER)[0]);
        expect(promptA.split(CACHE_TIER_MARKER)[1]).not.toBe(promptB.split(CACHE_TIER_MARKER)[1]);
    });
});
