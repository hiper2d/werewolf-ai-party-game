import { AbstractAgent } from '@/app/ai/abstract-agent';
import {
    DEFAULT_MAX_OUTPUT_TOKENS,
    STORY_MAX_OUTPUT_TOKENS,
    LLM_CONSTANTS,
    SupportedAiModels,
} from '@/app/ai/ai-models';
import { AgentFactory } from '@/app/ai/agent-factory';
import { API_KEY_CONSTANTS } from '@/app/ai/ai-models';
import * as fs from 'fs';
import * as path from 'path';

const apiKeys = Object.fromEntries(
    Object.values(API_KEY_CONSTANTS).map(name => [name, 'test-key'])
);

/** Every picker model, so a newly added one is covered without editing this file. */
const ALL_MODEL_IDS = Object.keys(SupportedAiModels);

describe('max output tokens', () => {
    it('resolves the shared default for models with no catalog override', () => {
        const agent = AgentFactory.createAgent('bot', 'instruction', LLM_CONSTANTS.CLAUDE_4_HAIKU, apiKeys);
        expect(SupportedAiModels[LLM_CONSTANTS.CLAUDE_4_HAIKU].maxOutputTokens).toBeUndefined();
        expect(agent.maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    });

    it('prefers a catalog override where one is set', () => {
        const flash = SupportedAiModels[LLM_CONSTANTS.DEEPSEEK_V4_FLASH];
        expect(flash.maxOutputTokens).toBeDefined();
        const agent = AgentFactory.createAgent('bot', 'instruction', LLM_CONSTANTS.DEEPSEEK_V4_FLASH, apiKeys);
        expect(agent.maxOutputTokens).toBe(flash.maxOutputTokens);
    });

    it('gives every model a positive budget that leaves room for its thinking budget', () => {
        for (const id of ALL_MODEL_IDS) {
            const agent = AgentFactory.createAgent('bot', 'instruction', id, apiKeys);
            expect(agent.maxOutputTokens).toBeGreaterThan(0);
            // Providers bill reasoning inside the output budget, and Anthropic additionally
            // rejects budget_tokens >= max_tokens.
            const budget = SupportedAiModels[id].thinkingBudgetTokens;
            if (budget !== undefined) {
                expect(agent.maxOutputTokens).toBeGreaterThan(budget);
            }
        }
    });

    it('is mutable per agent, so the story path can raise it without affecting others', () => {
        const story = AgentFactory.createAgent('gm', 'instruction', LLM_CONSTANTS.CLAUDE_4_HAIKU, apiKeys);
        const bot = AgentFactory.createAgent('bot', 'instruction', LLM_CONSTANTS.CLAUDE_4_HAIKU, apiKeys);
        story.maxOutputTokens = STORY_MAX_OUTPUT_TOKENS;
        expect(story.maxOutputTokens).toBe(STORY_MAX_OUTPUT_TOKENS);
        expect(bot.maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    });

    it('story generation gets more room than an ordinary turn', () => {
        expect(STORY_MAX_OUTPUT_TOKENS).toBeGreaterThan(DEFAULT_MAX_OUTPUT_TOKENS);
    });

    /**
     * The regression this refactor exists to prevent: an agent that snapshots the cap into a
     * field initializer ignores a later override, so the story call would silently run at the
     * turn-sized default. Guard structurally — no agent may hardcode a token ceiling.
     */
    it('no agent hardcodes an output-token ceiling', () => {
        const dir = path.join(process.cwd(), 'app', 'ai');
        const agentFiles = fs.readdirSync(dir).filter(f => f.endsWith('-agent.ts') && !f.includes('.test.'));
        expect(agentFiles.length).toBeGreaterThan(5);

        const offenders: string[] = [];
        for (const file of agentFiles) {
            const src = fs.readFileSync(path.join(dir, file), 'utf8');
            for (const line of src.split('\n')) {
                // A numeric literal assigned to any max-tokens-shaped key.
                if (/\b(max_tokens|maxTokens|max_output_tokens|maxOutputTokens|max_completion_tokens)\s*[:=]\s*\d+/.test(line)) {
                    offenders.push(`${file}: ${line.trim()}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
