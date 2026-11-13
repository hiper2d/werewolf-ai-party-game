// Probe: doctor and detective night commands answered through the shared bot answer schema
// (askBotChoice) by real models, on a real game's last day (read-only).
// Usage: npx tsx --env-file=.env scripts/probe-night-answer.ts [--models gpt-mini,deepseek-flash]
import { db } from '../firebase/server';
import { AgentFactory } from '../app/ai/agent-factory';
import { askBotChoice, resolveBotAction } from '../app/ai/bot-turn';
import { BOT_DOCTOR_ACTION_PROMPT, BOT_DETECTIVE_ACTION_PROMPT, STRICT_TARGET_NAME_INSTRUCTION } from '../app/ai/prompts/bot-prompts';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { Bot, Game, GAME_MASTER, GAME_ROLES, GameMessage, MESSAGE_ROLE, MessageType, ROLE_CONFIGS } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import { buildBotSystemPrompt, buildBotTurnTail } from '../app/utils/bot-utils';

const argv = process.argv.slice(2);
const arg = (flag: string) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : undefined; };
const MODELS = (arg('--models') ?? 'gpt-mini,mistral-small,gemini-flash,deepseek-flash').split(',');

(async () => {
    const snap = await db!.collection('games').orderBy('createdAt', 'desc').limit(80).get();
    const gameId = arg('--game') ?? snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).find(g => (g.currentDay || 1) >= 3)!.id;
    const game = await getGame(gameId) as Game;
    const day = game.currentDay || 1;
    const apiKeys = (await db!.collection('config').doc('freeTierApiKeys').get()).data()?.keys as any;
    const base = game.bots.find(b => b.isAlive) as Bot;
    const messages = await getBotMessages(gameId, base.name, day);
    const targets = [...game.bots.filter(b => b.isAlive && b.name !== base.name).map(b => b.name), game.humanPlayerName];
    const commands: [string, string, readonly string[], string][] = [
        [GAME_ROLES.DOCTOR, format(BOT_DOCTOR_ACTION_PROMPT, { bot_name: base.name }) + ROLE_CONFIGS[GAME_ROLES.DOCTOR].oneTimeAbilities!.kill!.promptAddition
            + `\n\n**Available targets for protection or kill:** ${targets.join(', ')}`
            + `\n\n**Valid actions tonight (the \`action\` field) — pick ONE:** "protect" (the default, also when left null) or "kill" (the one-time Doctor's Mistake)` + STRICT_TARGET_NAME_INSTRUCTION, ['protect', 'kill'], 'protect'],
        [GAME_ROLES.DETECTIVE, `${format(BOT_DETECTIVE_ACTION_PROMPT, { bot_name: base.name })}\n\n**Available targets:** ${targets.join(', ')}` + STRICT_TARGET_NAME_INSTRUCTION, ['investigate', 'kill'], 'investigate'],
    ];
    for (const model of MODELS) {
        for (const [role, text, allowed, fallback] of commands) {
            const bot = { ...base, role, aiType: model, roleKnowledge: undefined } as Bot;
            const g = { ...game, bots: game.bots.map(b => b.name === bot.name ? bot : b) } as Game;
            const agent = AgentFactory.createAgent(bot.name, buildBotSystemPrompt(bot, g), model, apiKeys, bot.enableThinking);
            const cmd: GameMessage = { id: null, recipientName: bot.name, authorName: GAME_MASTER, msg: text, messageType: MessageType.GM_COMMAND, day, timestamp: Date.now() };
            const history = [...convertToAIMessages(bot.name, [...messages, cmd]), { role: MESSAGE_ROLE.USER, content: buildBotTurnTail(bot, g, 'night') }];
            try {
                const t = Date.now();
                const [a] = await askBotChoice(agent, history);
                let action: string;
                try { action = resolveBotAction(a!, allowed, fallback, bot.name); } catch (e) { action = `REJECTED (${a!.action})`; }
                console.log(`${model.padEnd(15)} ${role.padEnd(9)} ${((Date.now() - t) / 1000).toFixed(1)}s target=${a?.target}${a?.target && targets.includes(a.target) ? '' : ' INVALID'} action=${JSON.stringify(a?.action)} -> ${action} story=${JSON.stringify(a?.story)?.slice(0, 90)} reasoning=${(a?.comment || '').length}ch`);
            } catch (e) {
                console.log(`${model.padEnd(15)} ${role.padEnd(9)} FAILED ${(e as Error).message.slice(0, 200)}`);
            }
        }
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
