/**
 * Pins BOT_SYSTEM_PROMPT's cache-tier contract: the shared tier above CACHE_TIER_MARKER is
 * byte-identical across bots (no placeholders), so provider prompt caches hit across the
 * lobby. The marker/agent plumbing itself is tested in @hiper2d/ai-agents.
 */
import { botSystemPrompt, CACHE_TIER_MARKER } from './prompts/bot-prompts';
import { GAME_MODES, GameMode } from '@/app/api/game-models';
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

describe.each(Object.values(GAME_MODES))('botSystemPrompt(%s) cache tiers', (mode: GameMode) => {
    const BOT_SYSTEM_PROMPT = botSystemPrompt(mode);

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

describe('game modes', () => {
    it('roleplay drops the facade doctrine; tactical keeps it', () => {
        const roleplay = botSystemPrompt(GAME_MODES.ROLEPLAY);
        const tactical = botSystemPrompt(GAME_MODES.TACTICAL);
        expect(tactical).toContain('PERSONA CANNOT DRIVE SUSPICIONS OR VOTES');
        expect(roleplay).not.toContain('PERSONA CANNOT DRIVE SUSPICIONS OR VOTES');
        expect(roleplay).not.toMatch(/stories are just flavor/i);
        expect(roleplay).toContain('you ARE the character');
        // Both keep the rules and the identity tail
        for (const p of [roleplay, tactical]) {
            expect(p).toContain('**Victory Conditions:**');
            expect(p).toContain('## Character Identity');
        }
    });

    it('defaults to roleplay for games without the setting', () => {
        expect(botSystemPrompt(undefined)).toBe(botSystemPrompt(GAME_MODES.ROLEPLAY));
    });
});
