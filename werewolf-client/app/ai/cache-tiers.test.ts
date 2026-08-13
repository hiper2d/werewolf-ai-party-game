/**
 * Pins the prompt-cache plumbing:
 * - CACHE_TIER_MARKER splits an instruction into tiers in AbstractAgent
 * - ClaudeAgent emits one cacheable system block per tier and anchors its fast
 *   breakpoint on the second-to-last message (never on the throwaway tail)
 * - the default prepareMessages merges consecutive user messages back together
 *   for providers that expect alternating roles; ClaudeAgent keeps them separate
 * - BOT_SYSTEM_PROMPT's shared tier is byte-identical across bots (no placeholders)
 */
import { ClaudeAgent } from './anthropic-agent';
import { DeepSeekV2Agent } from './deepseek-v2-agent';
import { BOT_SYSTEM_PROMPT, CACHE_TIER_MARKER } from './prompts/bot-prompts';
import { format } from './prompts/utils';
import { AIMessage } from '@/app/api/game-models';

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

describe('prompt cache tiers', () => {
    it('BOT_SYSTEM_PROMPT keeps all placeholders below the cache tier marker', () => {
        const [sharedTier, ...rest] = BOT_SYSTEM_PROMPT.split(CACHE_TIER_MARKER);
        expect(rest.length).toBe(1); // exactly one marker
        expect(sharedTier).not.toMatch(/%\w+%/); // shared tier is bot-independent
        expect(rest[0]).toMatch(/%name%/);
        expect(rest[0]).toMatch(/%bot_context%/);
    });

    it('the shared tier is byte-identical across differently formatted bots', () => {
        const promptA = format(BOT_SYSTEM_PROMPT, IDENTITY_PARAMS);
        const promptB = format(BOT_SYSTEM_PROMPT, { ...IDENTITY_PARAMS, name: 'OtherBot', personal_story: 'Another story' });
        expect(promptA.split(CACHE_TIER_MARKER)[0]).toBe(promptB.split(CACHE_TIER_MARKER)[0]);
        expect(promptA.split(CACHE_TIER_MARKER)[1]).not.toBe(promptB.split(CACHE_TIER_MARKER)[1]);
    });

    it('ClaudeAgent emits one cacheable system block per tier', () => {
        const instruction = format(BOT_SYSTEM_PROMPT, IDENTITY_PARAMS);
        const agent = new ClaudeAgent('TestBot', instruction, 'claude-sonnet-5', 'test-key');
        const system = (agent as any).defaultParams.system;
        expect(system).toHaveLength(2);
        for (const block of system) {
            expect(block.type).toBe('text');
            expect(block.cache_control).toEqual({ type: 'ephemeral' });
            expect(block.text).not.toContain('CACHE_TIER_BREAK');
        }
        expect(system[0].text).toContain('# Werewolf AI Bot System Prompt');
        expect(system[1].text).toContain('TestBot');
    });

    it('ClaudeAgent falls back to a single system block for marker-free prompts (GM)', () => {
        const agent = new ClaudeAgent('GM', 'You are the Game Master.', 'claude-sonnet-5', 'test-key');
        const system = (agent as any).defaultParams.system;
        expect(system).toHaveLength(1);
        expect(system[0].text).toBe('You are the Game Master.');
    });

    it('ClaudeAgent anchors the fast breakpoint one position back, not on the tail', () => {
        const agent = new ClaudeAgent('TestBot', 'instruction', 'claude-sonnet-5', 'test-key');
        const messages = [
            { role: 'user', content: 'first command' },
            { role: 'assistant', content: 'reply' },
            { role: 'user', content: 'current command' },
            { role: 'user', content: 'throwaway reminder' },
        ];
        (agent as any).applyCacheBreakpoint(messages);
        expect(messages[2].content).toEqual([
            { type: 'text', text: 'current command', cache_control: { type: 'ephemeral' } },
        ]);
        expect(typeof messages[3].content).toBe('string'); // tail untouched
    });

    it('ClaudeAgent reconstructs full prompt size from cache fields and bills hits at the cached rate', () => {
        const agent = new ClaudeAgent('TestBot', 'instruction', 'claude-sonnet-5', 'test-key');
        // Anthropic's input_tokens EXCLUDES cached tokens: total prompt = 100 + 4000 + 500.
        const usage = (agent as any).buildTokenUsage({
            input_tokens: 100,
            output_tokens: 200,
            cache_read_input_tokens: 4000,
            cache_creation_input_tokens: 500,
        });
        expect(usage.inputTokens).toBe(4600);
        expect(usage.outputTokens).toBe(200);
        expect(usage.totalTokens).toBe(4800);
        // Sonnet 5: $2/M input, $10/M output, $0.20/M cached.
        // (600 uncached+written) * 2 + 4000 cached * 0.20 + 200 out * 10, per million.
        const expected = (600 * 2.0 + 4000 * 0.20 + 200 * 10.0) / 1_000_000;
        expect(usage.costUSD).toBeCloseTo(expected, 10);
    });

    it('default prepareMessages merges consecutive user messages; ClaudeAgent keeps them apart', () => {
        const history: AIMessage[] = [
            { role: 'assistant', content: 'earlier reply' },
            { role: 'user', content: 'GM command' },
            { role: 'user', content: 'reminder' },
        ];
        const deepseek = new DeepSeekV2Agent('TestBot', 'instruction', 'deepseek-v4-flash', 'test-key', 0.6);
        const merged = (deepseek as any).prepareMessages(history);
        expect(merged).toHaveLength(2);
        expect(merged[1].content).toBe('GM command\n\nreminder');

        const claude = new ClaudeAgent('TestBot', 'instruction', 'claude-sonnet-5', 'test-key');
        const kept = (claude as any).prepareMessages(history);
        expect(kept).toHaveLength(3);
    });
});
