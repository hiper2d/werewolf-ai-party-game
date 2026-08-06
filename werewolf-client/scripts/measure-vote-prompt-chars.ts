// One-off: character count of the day-2 vote prompt exactly as all-models.test.ts builds it.
import { BOT_SYSTEM_PROMPT, BOT_VOTE_PROMPT, BOT_REMINDER_POSTFIX } from '../app/ai/prompts/bot-prompts';
import { format } from '../app/ai/prompts/utils';
import { convertToAIMessages } from '../app/utils/message-utils';
import { GAME_MASTER, GameMessage } from '../app/api/game-models';
import {
    generateBotContextSection,
    generateWerewolfTeammatesSection,
    generatePlayStyleDescription,
} from '../app/utils/bot-utils';
import { DAY2_VOTE_GAME, DAY2_MESSAGES, TEST_BOT_NAME } from '../app/ai/test-fixtures/day2-vote-fixture';

const kenji = DAY2_VOTE_GAME.bots.find(b => b.name === TEST_BOT_NAME)!;
const alivePlayerNames = [
    ...DAY2_VOTE_GAME.bots.filter(b => b.isAlive && b.name !== kenji.name).map(b => b.name),
    DAY2_VOTE_GAME.humanPlayerName,
];

const voteSystemPrompt = format(BOT_SYSTEM_PROMPT, {
    name: kenji.name,
    personal_story: kenji.story,
    play_style: "",
    role: kenji.role,
    human_player_name: DAY2_VOTE_GAME.humanPlayerName,
    werewolf_teammates_section: generateWerewolfTeammatesSection(kenji, DAY2_VOTE_GAME),
    players_names: alivePlayerNames.join(", "),
    dead_players_names_with_roles: DAY2_VOTE_GAME.bots.filter(b => !b.isAlive).map(b => `${b.name} (${b.role})`).join(", "),
    bot_context: generateBotContextSection(kenji, DAY2_VOTE_GAME),
});

const validTargetsList = alivePlayerNames.map(n => `- ${n}`).join("\n");
const voteCommand: GameMessage = {
    id: null,
    recipientName: kenji.name,
    authorName: GAME_MASTER,
    msg: format(BOT_VOTE_PROMPT, {
        bot_name: kenji.name, vote_position: "6", total_voters: "8",
        valid_targets: validTargetsList, werewolf_vote_note: "",
    }) + format(BOT_REMINDER_POSTFIX, {
        play_style: generatePlayStyleDescription(kenji),
        human_player_name: DAY2_VOTE_GAME.humanPlayerName,
    }),
    messageType: 'GM_COMMAND',
    day: 2,
    timestamp: Date.now(),
} as unknown as GameMessage;

const aiMessages = convertToAIMessages(kenji.name, [...DAY2_MESSAGES, voteCommand]);

const historyChars = aiMessages.reduce((n, m) => n + m.content.length, 0);
console.log(`System prompt:        ${voteSystemPrompt.length.toLocaleString()} chars`);
console.log(`Message history+cmd:  ${historyChars.toLocaleString()} chars (${aiMessages.length} messages)`);
console.log(`TOTAL sent:           ${(voteSystemPrompt.length + historyChars).toLocaleString()} chars`);
