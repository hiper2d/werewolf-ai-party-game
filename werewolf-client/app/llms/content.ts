/**
 * Builders for /llms.txt and /llms-full.txt (llmstxt.org).
 *
 * /llms.txt is the short index: an H1, a summary blockquote, a little prose, then
 * H2 sections of links. /llms-full.txt inlines the actual content so a crawler
 * gets the whole game in a single fetch.
 *
 * Everything that already exists as structured data — the role rules, the model
 * catalog, the changelog — is generated from that data rather than retyped, so
 * these files can't drift as models are added or rules change.
 */
import { isValidElement, type ReactNode } from 'react';
import { SITE_URL } from '@/app/config/external-links';
import { ROLE_DETAILS } from '@/app/rules/role-details';
import { CHANGELOG } from '@/app/news/changelog';
import { PLAY_STYLE_CONFIGS } from '@/app/api/game-models';
import {
    SupportedAiModels,
    SupportedAiKeyNames,
    MODEL_PRICING,
    FREE_TIER_THINKING_COST_FACTOR,
    getFreeTierPolicy,
    isHybridThinkingModel,
} from '@/app/ai/ai-models';

const url = (path: string) => `${SITE_URL}${path}`;

const SUMMARY =
    'Play the classic Werewolf (Mafia) social-deduction game against AI bots powered by frontier ' +
    'language models from OpenAI, Anthropic, Google, DeepSeek, Mistral, xAI, Moonshot, Z.AI, Qwen, ' +
    'MiniMax, and Sakana. Every bot has a secret role, a backstory, and its own voice — and none of ' +
    'them know which other players are AI.';

const INTRO = [
    'Werewolf AI is a free browser game. You join a table of AI players, get a secret role, and try to ' +
    'survive alternating day and night phases: argue your case in the day discussion, vote someone out, ' +
    'then watch the special roles act at night. The bots debate, lie, form alliances, and vote against ' +
    'you — they are playing to win, not to be helpful.',

    'The project doubles as an informal benchmark. Werewolf demands the things language models find ' +
    'hardest — reading intent, bluffing convincingly, coordinating with a hidden teammate, and reasoning ' +
    'under uncertainty over a long game — so mixing providers at one table makes their differences ' +
    'unusually visible.',

    'Playing is free on the Free tier (up to 5 games a day, a curated price-banded model set, voice ' +
    'acting included). The Paid tier is prepaid pay-as-you-go with the full catalog and no per-game bot ' +
    'caps. There is no subscription.',
].join('\n\n');

/**
 * The short index file. Link lists only — a consumer that wants the substance
 * follows the llms-full.txt link.
 */
export function buildLlmsTxt(): string {
    const modelCount = catalogModels().length;

    return `# Werewolf AI

> ${SUMMARY}

${INTRO}

## Game

- [Rules](${url('/rules')}): the full written rules — the two teams, how a day/night round works, win conditions, and every special role with its night order
- [Models](${url('/models')}): all ${modelCount} playable models with per-million input/output pricing and their free-tier bot caps
- [About](${url('/about')}): why the project exists, what it took to make LLMs follow the rules, and what they turned out to be good at
- [News](${url('/news')}): changelog of new models, features, and fixes
- [Play](${url('/games')}): create a game (requires a GitHub or Google sign-in)

## Full text

- [llms-full.txt](${url('/llms-full.txt')}): everything above inlined as one document — complete rules, all roles and night order, bot play styles, the full model catalog with prices, and the changelog

## Optional

- [Privacy policy](${url('/privacy')})
- [Terms of service](${url('/terms')})
- [Discord](https://discord.gg/PVY9dpU8X5): community server
`;
}

/**
 * The long file: same links, but with the content spelled out.
 */
export function buildLlmsFullTxt(): string {
    return `# Werewolf AI — Full Reference

> ${SUMMARY}

${INTRO}

Home page: ${url('/')}

## How a game works

Werewolf is a game of social deduction. The group is secretly split into two teams and plays in
alternating Day and Night phases until one team is wiped out. Villagers don't know who the wolves
are — wolves know each other.

The game starts with a Day and alternates until one team wins.

1. **Day — discussion.** All alive players debate who the werewolves are. There are no limits on what
   you can say, and it doesn't have to be true — nobody has to believe you either. After a certain
   number of messages you can call the vote; it also starts automatically when the discussion reaches
   a message limit.
2. **Day — voting.** Each alive player votes for exactly one other alive player, in a fixed order —
   nobody is allowed to skip. The player with the most votes is eliminated and their role is revealed.
   In case of a tie, the Game Master decides who dies randomly.
3. **Night.** Everyone "sleeps," and special roles act in a fixed order: Maniac, then Werewolves, then
   Doctor, then Detective. When all roles have acted, the Game Master announces who died with a short
   summary of the night, and the next day begins.

**Winning.** The Village wins the moment no Werewolves remain — the villagers, Doctor, Detective, and
Maniac all win together. The Werewolves win as soon as they reach parity: when their numbers equal the
Villagers', the village can no longer out-vote them.

## Roles

Special roles are optional and are turned on when a game is created.

${roleSections()}

## Bot play styles

Each AI bot is assigned a play style that shapes its personality and strategy during the game.

${playStyleLines()}

## Supported models

${modelSections()}

Prices are US dollars per million tokens. "cached" is the discounted rate for a prompt-cache hit.
A reasoning model "thinks" before it answers, and those hidden thinking tokens are billed at the
output rate on top of the visible reply, so a turn costs more than the listed output price. Where an
effective output price is shown, it is the output rate scaled by ×${FREE_TIER_THINKING_COST_FACTOR}
to include that reasoning overhead on average.

Free-tier caps are per game: "unlimited" means no limit on how many bots may use that model,
"3 / game" and "1 / game" cap it, and "paid only" means the model needs a prepaid balance.

## Changelog

${changelogEntries()}

## Optional

- Privacy policy: ${url('/privacy')}
- Terms of service: ${url('/terms')}
- Discord: https://discord.gg/PVY9dpU8X5
`;
}

function roleSections(): string {
    return ROLE_DETAILS.map(role => {
        const team = role.team === 'werewolf' ? 'Werewolf team' : 'Village team';
        const tags = [team, role.nightOrder ?? 'No night action'].join(' · ');
        const ability = role.oneTimeAbility ? `\n\nOne-time ability: ${role.oneTimeAbility}` : '';
        return `### ${role.name}\n\n${tags}\n\n${role.body}${ability}`;
    }).join('\n\n');
}

function playStyleLines(): string {
    return Object.values(PLAY_STYLE_CONFIGS)
        .map(style => `- **${style.name}**: ${style.uiDescription}`)
        .join('\n');
}

interface CatalogModel {
    name: string;
    provider: string;
    apiName: string;
    inputPrice: number;
    cachedPrice: number | null;
    outputPrice: number;
    effectiveOutputPrice: number | null;
    thinking: boolean;
    freeTier: string;
}

/**
 * Flatten SupportedAiModels into printable rows. Entries without pricing are skipped,
 * matching what the /models page shows.
 */
function catalogModels(): CatalogModel[] {
    const models: CatalogModel[] = [];
    for (const config of Object.values(SupportedAiModels)) {
        const pricing = MODEL_PRICING[config.modelApiName];
        if (!pricing) continue;

        const policy = config.freeTier ?? getFreeTierPolicy(config.modelApiName, config.hasThinking);
        models.push({
            name: config.displayName,
            provider: SupportedAiKeyNames[config.apiKeyName] ?? config.apiKeyName,
            apiName: config.modelApiName,
            inputPrice: pricing.inputPrice,
            cachedPrice: pricing.cacheHitPrice ?? null,
            outputPrice: pricing.outputPrice,
            effectiveOutputPrice: isHybridThinkingModel(config.modelApiName)
                ? pricing.outputPrice * FREE_TIER_THINKING_COST_FACTOR
                : null,
            thinking: config.hasThinking,
            freeTier: !policy.available
                ? 'paid only'
                : policy.maxBotsPerGame === -1
                    ? 'unlimited on free tier'
                    : `${policy.maxBotsPerGame} / game on free tier`,
        });
    }
    return models;
}

/**
 * Two decimals normally, but cache-hit rates can be a fraction of a cent
 * (e.g. $0.0028) — those keep enough precision not to print as $0.00.
 */
function price(dollars: number): string {
    return dollars >= 0.01 ? dollars.toFixed(2) : parseFloat(dollars.toFixed(4)).toString();
}

function modelSections(): string {
    const byProvider = new Map<string, CatalogModel[]>();
    for (const model of catalogModels()) {
        const group = byProvider.get(model.provider);
        if (group) group.push(model);
        else byProvider.set(model.provider, [model]);
    }

    return [...byProvider.entries()]
        .map(([provider, models]) => {
            const rows = models
                .sort((a, b) => a.inputPrice - b.inputPrice || a.outputPrice - b.outputPrice)
                .map(m => {
                    const cached = m.cachedPrice !== null ? `, cached in $${price(m.cachedPrice)}` : '';
                    const effective = m.effectiveOutputPrice !== null
                        ? `, effective out $${price(m.effectiveOutputPrice)}`
                        : '';
                    const facts = [
                        `\`${m.apiName}\``,
                        `in $${price(m.inputPrice)}${cached}`,
                        `out $${price(m.outputPrice)}${effective}`,
                        m.thinking ? 'reasoning' : 'no reasoning',
                        m.freeTier,
                    ];
                    return `- **${m.name}** — ${facts.join(' · ')}`;
                })
                .join('\n');
            return `### ${provider}\n\n${rows}`;
        })
        .join('\n\n');
}

/**
 * Changelog bodies are JSX (they carry <strong> emphasis), so read the text out
 * of the node tree rather than keeping a parallel plain-text copy.
 */
function changelogEntries(): string {
    return CHANGELOG.map(entry => {
        const body = jsxToPlainText(entry.body);
        const links = entry.links.length > 0
            ? `\n  Links: ${entry.links.map(l => `${l.label} (${absolute(l.href)})`).join(', ')}`
            : '';
        const video = entry.media?.youtubeId
            ? `\n  Video: https://www.youtube.com/watch?v=${entry.media.youtubeId}`
            : '';
        return `- **${entry.title}** (${entry.date} · ${entry.tags.join(', ')})\n  ${body}${video}${links}`;
    }).join('\n');
}

const absolute = (href: string) => (href.startsWith('/') ? url(href) : href);

function jsxToPlainText(node: ReactNode): string {
    return collectText(node).replace(/\s+/g, ' ').trim();
}

/**
 * Walk the node tree and concatenate its text. Deliberately not react-dom/server:
 * Next refuses to bundle that into an App Router route handler. Entities in the
 * source (&apos;, &ldquo;) are already real characters by the time JSX compiles,
 * so there is nothing left to decode here.
 */
function collectText(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collectText).join('');
    if (isValidElement(node)) return collectText((node.props as { children?: ReactNode }).children);
    return '';
}
