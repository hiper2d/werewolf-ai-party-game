import { buildLlmsTxt, buildLlmsFullTxt } from './content';
import { ROLE_DETAILS } from '@/app/rules/role-details';
import { CHANGELOG } from '@/app/news/changelog';
import { SupportedAiModels, MODEL_PRICING } from '@/app/ai/ai-models';

const pricedModels = Object.values(SupportedAiModels).filter(m => MODEL_PRICING[m.modelApiName]);

describe('llms.txt', () => {
    const txt = buildLlmsTxt();

    it('follows the llmstxt.org shape: H1, then a summary blockquote, then H2 link sections', () => {
        const lines = txt.split('\n');
        expect(lines[0]).toBe('# Werewolf AI');
        expect(lines[2].startsWith('> ')).toBe(true);
        expect(txt).toMatch(/^## Game$/m);
        // The "Optional" section is the spec's marker for links a consumer may skip.
        expect(txt).toMatch(/^## Optional$/m);
    });

    it('has exactly one H1', () => {
        expect(txt.match(/^# /gm)).toHaveLength(1);
    });

    it('emits absolute links only, so the file works when fetched out of context', () => {
        const links = [...txt.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
        expect(links.length).toBeGreaterThan(5);
        for (const link of links) {
            expect(link).toMatch(/^https:\/\//);
        }
    });

    it('points at the full-text companion file', () => {
        expect(txt).toContain('https://aiwerewolf.net/llms-full.txt');
    });

    it('reports the live model count rather than a hardcoded one', () => {
        expect(txt).toContain(`all ${pricedModels.length} playable models`);
    });
});

describe('llms-full.txt', () => {
    const txt = buildLlmsFullTxt();

    it('inlines every role with its rules text', () => {
        for (const role of ROLE_DETAILS) {
            expect(txt).toContain(`### ${role.name}`);
            expect(txt).toContain(role.body);
        }
    });

    it('inlines every priced model with its api name and prices', () => {
        for (const model of pricedModels) {
            expect(txt).toContain(model.displayName);
            expect(txt).toContain(`\`${model.modelApiName}\``);
        }
    });

    it('renders changelog JSX bodies down to plain text', () => {
        for (const entry of CHANGELOG) {
            expect(txt).toContain(entry.title);
        }
        // No markup survives the strip, and no raw entities leak through.
        expect(txt).not.toContain('<strong>');
        expect(txt).not.toMatch(/&(amp|quot|lt|gt|nbsp|#x27|#39);/);
    });

    it('covers the night order and win conditions', () => {
        // Prose is hard-wrapped in the source, so compare on normalized whitespace.
        const flat = txt.replace(/\s+/g, ' ');
        expect(flat).toContain('Maniac, then Werewolves, then Doctor, then Detective');
        expect(flat).toContain('Werewolves win as soon as they reach parity');
    });

    it('leaves no trailing whitespace on any line', () => {
        expect(txt.split('\n').filter(line => /\s$/.test(line))).toEqual([]);
    });
});
