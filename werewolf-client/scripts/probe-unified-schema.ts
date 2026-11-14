// Probe: does ONE shared answer schema on every bot turn keep the provider prompt cache
// across a discussion reply → vote, where today's text reply → vote schema loses it?
// Uses a real game's last day (read-only) and real model calls. Per model and per run:
//   current: discussion reply as plain text, then the vote with BotVoteZodSchema
//   unified: both calls with the same {comment, target, action} schema
// Each sequence gets a unique line at the top of the system prompt, so the vote's cached
// tokens can only come from that sequence's own first call.
// Usage: npx tsx --env-file=.env scripts/probe-unified-schema.ts [--game <id>] [--bot <name>]
//        [--models gpt-mini,deepseek-flash] [--runs 3] [--long] [--variants unified] [--day 2]
import { z } from 'zod';
import { db } from '../firebase/server';
import { AgentFactory } from '../app/ai/agent-factory';
import { BOT_VOTE_PROMPT } from '../app/ai/prompts/bot-prompts';
import { BotVoteZodSchema } from '../app/ai/prompts/zod-schemas';
import { GM_COMMAND_REPLY_TO_DISCUSSION } from '../app/ai/prompts/gm-commands';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, Game, GAME_MASTER, GameMessage, MESSAGE_ROLE, MessageType } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';

const argv = process.argv.slice(2);
const arg = (flag: string) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : undefined; };
const MODELS = (arg('--models') ?? 'gpt-mini,deepseek-flash').split(',');
const RUNS = parseInt(arg('--runs') ?? '3', 10);
const LONG = argv.includes('--long');          // long discussion replies (the game's longReplies switch)
const VARIANTS = (arg('--variants') ?? 'current,unified').split(',') as ('current' | 'unified' | 'strings')[];

// Generic on purpose: which field a turn needs is said by the GM command, checked in code.
const UnifiedSchema = z.object({
    comment: z.string().nullable().describe('Your text reply, when the command asks for one. Otherwise null.'),
    target: z.string().nullable().describe('One exact player name, when the command asks you to choose a player. Otherwise null.'),
    action: z.string().nullable().describe('The action to apply to the target, when the command asks you to pick an action. Otherwise null.'),
});
// 'strings' variant (2026-11-14): the same four fields as required plain strings, "" when a
// turn does not use one. GPT-6.1 Terra wrote junk into the nullable fields and hung.
const StringsSchema = z.object({
    comment: z.string().describe('Your text reply, when the command asks for one. Otherwise an empty string.'),
    target: z.string().describe('One exact player name, when the command asks you to choose a player. Otherwise an empty string.'),
    action: z.string().describe('The action to apply to the target, when the command asks you to pick an action. Otherwise an empty string.'),
    story: z.string().describe('One short in-world sentence of mood and imagery, when the command invites one. Otherwise an empty string.'),
});
const STRINGS_DISCUSSION = '\n\n**ANSWER FORMAT:** a JSON object with exactly four fields: `comment`, `target`, `action`, `story`. Put your reply in `comment`. Set `target`, `action` and `story` to "" (an empty string).';
const STRINGS_VOTE = '\n\n**ANSWER FORMAT:** a JSON object with exactly four fields: `comment`, `target`, `action`, `story`. Put the name you vote for in `target` and your brief reason in `comment`. Set `action` and `story` to "" (an empty string).';
const UNIFIED_DISCUSSION = '\n\n**Answer format:** a JSON object. Put your reply in `comment`; set `target` and `action` to null.';
const UNIFIED_VOTE = '\n\n**Answer format:** a JSON object. Put the name you vote for in `target` and your brief reason in `comment`; set `action` to null.';

(async () => {
    let gameId = arg('--game');
    if (!gameId) {
        const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
        gameId = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3)!.id;
    }
    const game = { ...(await getGame(gameId!) as Game), ...(LONG ? { longReplies: true } : {}) } as Game;
    const bot = (arg('--bot') ? game.bots.find(b => b.name === arg('--bot')) : game.bots.find(b => b.isAlive)) as Bot;
    const day = parseInt(arg('--day') ?? String(game.currentDay || 1), 10); // --day: use an earlier day's (longer) message log
    const apiKeys = (await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any;
    const baseSystem = buildBotSystemPrompt(bot, game);
    const dayMessages = await getBotMessages(gameId!, bot.name, day);
    const alive = [...game.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name), game.humanPlayerName];
    const tail = { role: MESSAGE_ROLE.USER, content: buildBotTurnTail(bot, game, 'table') };
    const gm = (msg: string): GameMessage => ({ id: null, recipientName: bot.name, authorName: GAME_MASTER, msg, messageType: MessageType.GM_COMMAND, day, timestamp: Date.now() });
    const discussionCmd = format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name, messages_used: '1', messages_total: '6', vote_progress_pct: '20%' });
    const voteCmd = format(BOT_VOTE_PROMPT, { bot_name: bot.name, vote_position: '1', total_voters: String(alive.length + 1), valid_targets: alive.map(n => `- ${n}`).join('\n'), werewolf_vote_note: '' });
    console.log(`game ${gameId} day ${day}, bot ${bot.name} (${bot.role}), system ${baseSystem.length} chars, ${dayMessages.length} day messages`);

    const u = (x: any) => `in=${x?.inputTokens} cached=${x?.cachedInputTokens ?? 0} (${x?.inputTokens ? Math.round(100 * (x.cachedInputTokens ?? 0) / x.inputTokens) : 0}%) reason=${x?.reasoningTokens ?? '-'} out=${x?.outputTokens}`;

    for (const model of MODELS) {
        for (let run = 1; run <= RUNS; run++) {
            for (const variant of VARIANTS) {
                const system = `Session ${model}-${variant}-${run}-${Date.now()}\n\n${baseSystem}`;
                const agent = AgentFactory.createAgent(bot.name, system, model, apiKeys, bot.enableThinking);
                agent.invalidResponseRetries = 0; // count every malformed answer
                const strings = variant === 'strings';
                const unified = variant === 'unified' || strings;
                const Schema: z.ZodSchema<any> = strings ? StringsSchema : UnifiedSchema;
                try {
                    // 1. discussion reply
                    const cmd1 = gm(discussionCmd + (strings ? STRINGS_DISCUSSION : unified ? UNIFIED_DISCUSSION : ''));
                    const h1 = [...convertToAIMessages(bot.name, [...dayMessages, cmd1]), tail];
                    const t1 = Date.now();
                    let reply: string, usage1: any;
                    if (unified) {
                        const [r, , us] = await agent.askWithZodSchema(Schema, h1);
                        reply = r.comment ?? ''; usage1 = us;
                        if (!r.comment || (strings ? (r.target || r.action || r.story) : (r.target !== null || r.action !== null))) console.log(`   ! ${variant} discussion fields off: comment=${!!r.comment} target=${JSON.stringify(r.target)} action=${JSON.stringify(r.action)} story=${JSON.stringify(r.story)}`);
                    } else {
                        const [r, , us] = await agent.askText(h1);
                        reply = r ?? ''; usage1 = us;
                    }
                    const s1 = ((Date.now() - t1) / 1000).toFixed(1);
                    // 2. vote, with the reply saved in history as the game does
                    const saved: GameMessage = { id: null, recipientName: 'ALL', authorName: bot.name, msg: { reply }, messageType: MessageType.BOT_ANSWER, day, timestamp: Date.now() } as any;
                    const cmd2 = gm(voteCmd + (strings ? STRINGS_VOTE : unified ? UNIFIED_VOTE : ''));
                    const h2 = [...convertToAIMessages(bot.name, [...dayMessages, cmd1, saved, cmd2]), tail];
                    const t2 = Date.now();
                    let target: string | null, usage2: any;
                    if (unified) {
                        const [r, , us] = await agent.askWithZodSchema(Schema, h2);
                        if (strings && (r.action || r.story)) console.log(`   ! strings vote fields off: action=${JSON.stringify(r.action)} story=${JSON.stringify(r.story)}`);
                        target = r.target; usage2 = us;
                    } else {
                        const [r, , us] = await agent.askWithZodSchema(BotVoteZodSchema, h2);
                        target = r.who; usage2 = us;
                    }
                    const s2 = ((Date.now() - t2) / 1000).toFixed(1);
                    console.log(`${model.padEnd(15)} run ${run} ${variant.padEnd(8)} | discussion ${s1}s ${u(usage1)} reply=${reply.length}ch | vote ${s2}s ${u(usage2)} target=${target}${target && alive.includes(target) ? '' : ' INVALID'}`);
                } catch (e) {
                    console.log(`${model.padEnd(15)} run ${run} ${variant.padEnd(8)} | FAILED ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`);
                }
            }
        }
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
