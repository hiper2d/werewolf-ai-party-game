// Rebuild a bot's CURRENT discussion-reply prompt exactly as processNextBotInQueue
// (bot-actions.ts) builds it, from live Firestore data, and write it to logs/.
// Usage: npx tsx --env-file=.env scripts/rebuild-bot-prompt.ts <gameId> <botName>
// Output: logs/<botName>-day<N>-prompt.txt with the system prompt (tier 1, the
// CACHE_TIER_BREAK marker, tier 2) followed by every history turn with sizes.
import { db } from '../firebase/server';
import { botSystemPrompt, botReminderPostfix, replyLengthInstruction } from '../app/ai/prompts/bot-prompts';
import { GM_COMMAND_REPLY_TO_DISCUSSION } from '../app/ai/prompts/gm-commands';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { GAME_MASTER, GameMessage, MessageType, Game } from '../app/api/game-models';
import { getBotMessages, getGame } from '../app/api/game-actions';
import {
    generateBotContextSection, generateWerewolfTeammatesSection, generatePlayStyleDescription,
} from '../app/utils/bot-utils';
import * as fs from 'fs';

(async () => {
  const [gameId, botName] = process.argv.slice(2);
  if (!gameId || !botName) { console.error('usage: rebuild-bot-prompt.ts <gameId> <botName>'); process.exit(1); }
  const game = await getGame(gameId) as Game;
  const bot = game.bots.find(b => b.name === botName);
  if (!bot) { console.error(`bot ${botName} not in game ${gameId}: ${game.bots.map(b => b.name).join(', ')}`); process.exit(1); }
  const alive = [...game.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name), game.humanPlayerName].join(', ');

  const systemPrompt = format(botSystemPrompt(game.gameMode), {
    name: bot.name, personal_story: bot.story, play_style: "", role: bot.role,
    human_player_name: game.humanPlayerName,
    werewolf_teammates_section: generateWerewolfTeammatesSection(bot, game),
    players_names: alive,
    dead_players_names_with_roles: game.bots.filter(b => !b.isAlive).map(b => `${b.name} (${b.role})`).join(", "),
    bot_context: generateBotContextSection(bot, game),
  });

  const gmMessage: GameMessage = {
    id: null, recipientName: bot.name, authorName: GAME_MASTER,
    msg: format(GM_COMMAND_REPLY_TO_DISCUSSION, { bot_name: bot.name, messages_used: 'N', messages_total: 'M', vote_progress_pct: 'P%' }),
    messageType: MessageType.GM_COMMAND, day: game.currentDay, timestamp: Date.now(),
  };
  const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);
  const reminder = format(botReminderPostfix(game.gameMode), {
    play_style: generatePlayStyleDescription(bot), human_player_name: game.humanPlayerName,
    reply_length_instruction: replyLengthInstruction(game.longReplies),
  });
  const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
  history.push({ role: 'user' as any, content: reminder.trim() });

  let out = `# ${bot.name} day-${game.currentDay} discussion-reply prompt (rebuilt ${new Date().toISOString()})\n`;
  out += `# model: ${bot.aiType}   gameState: ${game.gameState}   botMessages: ${botMessages.length}   history turns: ${history.length}\n\n`;
  out += `==================== SYSTEM PROMPT (${systemPrompt.length} chars) ====================\n\n${systemPrompt}\n\n`;
  out += `==================== HISTORY (${history.length} messages) ====================\n\n`;
  history.forEach((m, i) => { out += `----- [${i}] role=${m.role} (${String(m.content).length} chars) -----\n${m.content}\n\n`; });
  fs.mkdirSync('logs', { recursive: true });
  const path = `logs/${bot.name.toLowerCase()}-day${game.currentDay}-prompt.txt`;
  fs.writeFileSync(path, out);
  console.log(`WROTE ${path}`);
  console.log(`system=${systemPrompt.length} chars, history=${history.length} msgs, total=${out.length} chars`);
  console.log('history roles:', history.map(m => m.role).join(','));
})();
