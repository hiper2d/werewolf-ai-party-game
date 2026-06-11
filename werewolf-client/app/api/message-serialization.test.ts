import { serializeMessageForFirestore } from './message-serialization';
import { convertToAIMessages } from '@/app/utils/message-utils';
import {
  GameMessage,
  GAME_MASTER,
  MessageType,
  MESSAGE_ROLE,
  RECIPIENT_ALL,
} from '@/app/api/game-models';

const BOT = 'Bot C';
const DAY = 1;

let seq = 0;
function msgOf(author: string, msg: any, messageType: string, cost?: number): GameMessage {
  return {
    id: String(++seq),
    recipientName: RECIPIENT_ALL,
    authorName: author,
    msg,
    messageType,
    day: DAY,
    timestamp: seq * 1000,
    ...(cost !== undefined ? { cost } : {}),
  };
}
beforeEach(() => { seq = 0; });

/**
 * Simulates a Firestore write+read: the serialized doc is JSON-cloned (the wire
 * format), then re-read the way getGameMessages() reconstructs a GameMessage —
 * only id/recipient/author/msg/messageType/day/timestamp survive.
 */
function roundTrip(message: GameMessage): GameMessage {
  const stored = JSON.parse(JSON.stringify(serializeMessageForFirestore(message)));
  return {
    id: stored.id,
    recipientName: stored.recipientName,
    authorName: stored.authorName,
    msg: stored.msg,
    messageType: stored.messageType,
    day: stored.day,
    timestamp: stored.timestamp,
  };
}

describe('serializeMessageForFirestore', () => {
  it('defaults missing cost to 0', () => {
    expect(serializeMessageForFirestore(msgOf(BOT, { reply: 'hi' }, MessageType.BOT_ANSWER)).cost).toBe(0);
  });

  it('preserves an explicit cost', () => {
    expect(serializeMessageForFirestore(msgOf(BOT, { reply: 'hi' }, MessageType.BOT_ANSWER, 0.0042)).cost).toBe(0.0042);
  });

  it('keeps envelope-object message types as objects', () => {
    const objectTypes = [
      MessageType.BOT_ANSWER,
      MessageType.BOT_WELCOME,
      MessageType.GAME_STORY,
      MessageType.VOTE_MESSAGE,
      MessageType.WEREWOLF_ACTION,
      MessageType.DOCTOR_ACTION,
      MessageType.MANIAC_ACTION,
      MessageType.NIGHT_SUMMARY,
    ];
    objectTypes.forEach((type) => {
      const original = { foo: 'bar', thinking: 't' };
      const out = serializeMessageForFirestore(msgOf(BOT, original, type));
      expect(typeof out.msg).toBe('object');
      expect(out.msg).toEqual(original);
    });
  });

  it('preserves plain-string message types verbatim', () => {
    const out = serializeMessageForFirestore(msgOf(GAME_MASTER, 'A plain command', MessageType.GM_COMMAND));
    expect(out.msg).toBe('A plain command');
  });
});

describe('store -> read -> replay round-trip (no migration guarantee)', () => {
  // Each case: a persisted message, then the AI-history content the current bot
  // should see after a Firestore round-trip. Locks "old games replay identically".
  const cases: Array<{ name: string; message: GameMessage; expectedContent: string; role: string }> = [
    {
      name: 'GM NIGHT_SUMMARY',
      message: msgOf(GAME_MASTER, { story: 'Dawn breaks. Bob is dead.', thinking: 'x', anthropicThinkingSignature: 's' }, MessageType.NIGHT_SUMMARY),
      expectedContent: 'Dawn breaks. Bob is dead.',
      role: MESSAGE_ROLE.USER,
    },
    {
      name: 'GM GAME_STORY',
      message: msgOf(GAME_MASTER, { story: 'A cursed village.' }, MessageType.GAME_STORY),
      expectedContent: 'A cursed village.',
      role: MESSAGE_ROLE.USER,
    },
    {
      name: 'GM_COMMAND string',
      message: msgOf(GAME_MASTER, 'Introduce yourself.', MessageType.GM_COMMAND),
      expectedContent: 'Introduce yourself.',
      role: MESSAGE_ROLE.USER,
    },
    {
      name: 'own BOT_ANSWER',
      message: msgOf(BOT, { reply: 'I suspect Bob.' }, MessageType.BOT_ANSWER),
      expectedContent: 'I suspect Bob.',
      role: MESSAGE_ROLE.ASSISTANT,
    },
    {
      name: 'own VOTE_MESSAGE',
      message: msgOf(BOT, { who: 'Bob', why: 'shifty' }, MessageType.VOTE_MESSAGE),
      expectedContent: '🗳️ Votes for Bob: "shifty"',
      role: MESSAGE_ROLE.ASSISTANT,
    },
    {
      name: 'own WEREWOLF_ACTION',
      message: msgOf(BOT, { target: 'Bob', reasoning: 'weak' }, MessageType.WEREWOLF_ACTION),
      expectedContent: 'Selected Bob for elimination. Reasoning: weak',
      role: MESSAGE_ROLE.ASSISTANT,
    },
  ];

  cases.forEach(({ name, message, expectedContent, role }) => {
    it(`replays ${name} identically with no [object Object]`, () => {
      const restored = roundTrip(message);
      const result = convertToAIMessages(BOT, [restored]);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(role);
      expect(result[0].content).toBe(expectedContent);
      expect(result[0].content).not.toContain('[object Object]');
    });
  });

  it('preserves thinking + signatures across the round-trip for own messages', () => {
    const message = msgOf(BOT, {
      reply: 'My answer.',
      thinking: 'reasoning',
      anthropicThinkingSignature: 'a-sig',
      googleThoughtSignature: 'g-sig',
    }, MessageType.BOT_ANSWER);

    const result = convertToAIMessages(BOT, [roundTrip(message)]);

    expect(result[0]).toMatchObject({
      role: MESSAGE_ROLE.ASSISTANT,
      content: 'My answer.',
      thinking: 'reasoning',
      anthropicThinkingSignature: 'a-sig',
      googleThoughtSignature: 'g-sig',
    });
  });

  it('replays a multi-message sequence in order', () => {
    const messages = [
      msgOf(GAME_MASTER, { story: 'Night falls.' }, MessageType.NIGHT_SUMMARY),
      msgOf(GAME_MASTER, 'Day 2. Discuss.', MessageType.GM_COMMAND),
      msgOf(BOT, { reply: 'Good morning.' }, MessageType.BOT_ANSWER),
    ].map(roundTrip);

    const result = convertToAIMessages(BOT, messages);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Night falls.\n\nDay 2. Discuss.');
    expect(result[0].content).not.toContain('[object Object]');
    expect(result[1].role).toBe(MESSAGE_ROLE.ASSISTANT);
    expect(result[1].content).toBe('Good morning.');
  });
});
