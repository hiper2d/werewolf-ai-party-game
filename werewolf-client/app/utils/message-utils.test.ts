import { convertToAIMessages, convertMessageContent } from './message-utils';
import {
  AIMessage,
  GameMessage,
  GAME_MASTER,
  MessageType,
  MESSAGE_ROLE,
  RECIPIENT_ALL
} from '@/app/api/game-models';

// ---------------------------------------------------------------------------
// Shared helpers for the message-type matrix below
// ---------------------------------------------------------------------------
const BOT = 'Bot C';
const OTHER_BOT = 'Bot A';
const HUMAN = 'Human Player';
const DAY = 1;

let seq = 0;
function gm(msg: any, messageType: string = MessageType.GM_COMMAND): GameMessage {
  return {
    id: String(++seq),
    recipientName: RECIPIENT_ALL,
    authorName: GAME_MASTER,
    msg,
    messageType,
    day: DAY,
    timestamp: seq * 1000,
  };
}
function from(author: string, msg: any, messageType: string): GameMessage {
  return {
    id: String(++seq),
    recipientName: RECIPIENT_ALL,
    authorName: author,
    msg,
    messageType,
    day: DAY,
    timestamp: seq * 1000,
  };
}
beforeEach(() => { seq = 0; });

describe('convertToAIMessages', () => {
  describe('Introduction sequence', () => {
    it('should correctly convert a sequence of introductions for bot C', () => {
      // Constants for our test
      const BOT_A = 'Bot A';
      const BOT_B = 'Bot B';
      const BOT_C = 'Bot C';
      const HUMAN_PLAYER = 'Human Player';
      const CURRENT_DAY = 1;
      
      // Create the message sequence as described in the requirements
      const messages: GameMessage[] = [
        // 1. GM tells everybody the story
        {
          id: '1',
          recipientName: RECIPIENT_ALL,
          authorName: GAME_MASTER,
          msg: { story: 'Welcome to the werewolf game set in a medieval village. The villagers suspect that werewolves are among them...' },
          messageType: MessageType.GAME_STORY,
          day: CURRENT_DAY,
          timestamp: 1000
        },
        // 1. GM tells everybody the story
        {
          id: '2',
          recipientName: RECIPIENT_ALL,
          authorName: GAME_MASTER,
          msg: { story: 'Welcome to the werewolf game set in a medieval village. The villagers suspect that werewolves are among them...' },
          messageType: MessageType.GAME_STORY,
          day: CURRENT_DAY,
          timestamp: 1000
        },
        
        // 5. Bot B introduces himself to everybody
        {
          id: '5',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_B,
          msg: { reply: 'Hello everyone! I am the village doctor. I have been treating the sick and injured in this village for many years.' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 5000
        },
        
        // 6. Human player introduces himself (no need for GM to ask)
        {
          id: '6',
          recipientName: RECIPIENT_ALL,
          authorName: HUMAN_PLAYER,
          msg: 'Hi all! I am the tavern keeper. My tavern is the center of gossip in this village.',
          messageType: MessageType.HUMAN_PLAYER_MESSAGE,
          day: CURRENT_DAY,
          timestamp: 6000
        },
        
        // 7. GM asks bot C to introduce itself
        {
          id: '7',
          recipientName: BOT_C,
          authorName: GAME_MASTER,
          msg: 'Welcome to the game! Please introduce yourself to the group.',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 7000
        },

        // 8. GM asks bot C to introduce itself
        {
          id: '8',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_C,
          msg: { reply: 'Hi, I am bot C.' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 8000
        }
      ];
      
      // Convert messages for Bot C
      const result = convertToAIMessages(BOT_C, messages);
      
      // Basic assertions - with deduplication, we expect 1 message
      expect(result.length).toBe(2);


      // Check that the final message includes Bot B and Human Player introductions
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe(`
      Welcome to the werewolf game set in a medieval village. The villagers suspect that werewolves are among them...

Welcome to the game! Please introduce yourself to the group.

## Messages from Other Players

Below are messages from the other players you haven't yet seen, listed in order:

**1. Bot B:** Hello everyone! I am the village doctor. I have been treating the sick and injured in this village for many years.

**2. Human Player:** Hi all! I am the tavern keeper. My tavern is the center of gossip in this village.
      `.trim());
      expect(result[1].role).toContain('assistant');
      expect(result[1].content).toContain('Hi, I am bot C.');
    });
    
    it('should handle a more complex conversation with multiple GM messages', () => {
      // Constants for our test
      const BOT_A = 'Bot A';
      const BOT_B = 'Bot B';
      const BOT_C = 'Bot C';
      const HUMAN_PLAYER = 'Human Player';
      const CURRENT_DAY = 1;
      
      // Create a more complex message sequence
      const messages: GameMessage[] = [
        // GM tells the story in two parts
        {
          id: '1',
          recipientName: RECIPIENT_ALL,
          authorName: GAME_MASTER,
          msg: { story: 'Part 1 of the story...' },
          messageType: MessageType.GAME_STORY,
          day: CURRENT_DAY,
          timestamp: 1000
        },
        {
          id: '2',
          recipientName: RECIPIENT_ALL,
          authorName: GAME_MASTER,
          msg: { story: 'Part 2 of the story...' },
          messageType: MessageType.GAME_STORY,
          day: CURRENT_DAY,
          timestamp: 2000
        },
        
        // // Bot A introduce itself to everybody
        {
          id: '5',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_A,
          msg: { reply: 'Bot A introduction' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 5000
        },
        
        // Bot C responds to GM (this is its own message)
        {
          id: '6',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_C,
          msg: { reply: 'Bot C first message' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 6000
        },
        
        // GM asks a question
        {
          id: '7',
          recipientName: RECIPIENT_ALL,
          authorName: GAME_MASTER,
          msg: 'A question from GM',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 7000
        },
        
        // Bot B responds
        {
          id: '8',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_B,
          msg: { reply: 'Bot B response' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 8000
        },
        
        // Human player responds
        {
          id: '9',
          recipientName: RECIPIENT_ALL,
          authorName: HUMAN_PLAYER,
          msg: 'Human player response',
          messageType: MessageType.HUMAN_PLAYER_MESSAGE,
          day: CURRENT_DAY,
          timestamp: 9000
        },
        
        // GM asks Bot C a question
        {
          id: '10',
          recipientName: BOT_C,
          authorName: GAME_MASTER,
          msg: 'A question for Bot C',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 10000
        }
      ];
      
      // Convert messages for Bot C
      const result = convertToAIMessages(BOT_C, messages);
      
      // Basic assertions - with deduplication, we expect 3 messages
      expect(result.length).toBe(3);
      
      expect(result[0].role).toBe(MESSAGE_ROLE.USER);
      expect(result[0].content).toBe(`Part 1 of the story...

Part 2 of the story...

## Messages from Other Players

Below are messages from the other players you haven't yet seen, listed in order:

**1. Bot A:** Bot A introduction`);

      expect(result[1].role).toBe(MESSAGE_ROLE.ASSISTANT);
      expect(result[1].content).toBe('Bot C first message');

      expect(result[2].role).toBe(MESSAGE_ROLE.USER);
      expect(result[2].content).toBe(`A question from GM

A question for Bot C

## Messages from Other Players

Below are messages from the other players you haven't yet seen, listed in order:

**1. Bot B:** Bot B response

**2. Human Player:** Human player response`);
    });
  });

  // -------------------------------------------------------------------------
  // GM message types: GAME_STORY and NIGHT_SUMMARY are stored as { story },
  // every other GM type is a plain string. NIGHT_SUMMARY used to replay as the
  // literal "[object Object]" — this pins the fix.
  // -------------------------------------------------------------------------
  describe('GM message types', () => {
    it('extracts .story from a NIGHT_SUMMARY (regression: no [object Object])', () => {
      const messages: GameMessage[] = [
        gm({ story: 'Dawn breaks. Bob was found dead.', thinking: 'gm reasoning', anthropicThinkingSignature: 'sig' }, MessageType.NIGHT_SUMMARY),
        gm('Day 2 begins. Discuss.', MessageType.GM_COMMAND),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(MESSAGE_ROLE.USER);
      expect(result[0].content).not.toContain('[object Object]');
      expect(result[0].content).toBe('Dawn breaks. Bob was found dead.\n\nDay 2 begins. Discuss.');
    });

    it('extracts .story from a GAME_STORY GM message', () => {
      const messages: GameMessage[] = [
        gm({ story: 'Once upon a time in a cursed village.' }, MessageType.GAME_STORY),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Once upon a time in a cursed village.');
    });

    it('passes through a plain-string GM_COMMAND verbatim', () => {
      const messages: GameMessage[] = [gm('Please introduce yourself.', MessageType.GM_COMMAND)];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Please introduce yourself.');
    });
  });

  // -------------------------------------------------------------------------
  // The current bot's own messages become assistant turns. Every structured
  // action type has its own formatting branch.
  // -------------------------------------------------------------------------
  describe('current bot own messages (assistant turns)', () => {
    const ownMessageCases: Array<{ name: string; type: string; msg: any; expected: string }> = [
      { name: 'BOT_ANSWER', type: MessageType.BOT_ANSWER, msg: { reply: 'I think Bob is suspicious.' }, expected: 'I think Bob is suspicious.' },
      { name: 'BOT_WELCOME', type: MessageType.BOT_WELCOME, msg: { reply: 'Hi, I am the baker.' }, expected: 'Hi, I am the baker.' },
      { name: 'VOTE_MESSAGE', type: MessageType.VOTE_MESSAGE, msg: { who: 'Bob', why: 'He is shifty.' }, expected: '🗳️ Votes for Bob: "He is shifty."' },
      { name: 'WEREWOLF_ACTION', type: MessageType.WEREWOLF_ACTION, msg: { target: 'Bob', reasoning: 'Weakest villager.' }, expected: 'Selected Bob for elimination. Reasoning: Weakest villager.' },
      { name: 'DOCTOR_ACTION protect', type: MessageType.DOCTOR_ACTION, msg: { target: 'Alice', reasoning: 'She is at risk.' }, expected: 'Protected Alice from werewolf attacks. Reasoning: She is at risk.' },
      { name: 'DOCTOR_ACTION kill', type: MessageType.DOCTOR_ACTION, msg: { target: 'Eve', reasoning: 'She is the wolf.', action_type: 'kill' }, expected: "Used Doctor's Mistake to kill Eve. Reasoning: She is the wolf." },
      { name: 'DETECTIVE_ACTION investigate', type: MessageType.DETECTIVE_ACTION, msg: { target: 'Bob', reasoning: 'He is quiet.' }, expected: 'Investigated Bob. Reasoning: He is quiet.' },
      { name: 'DETECTIVE_ACTION kill', type: MessageType.DETECTIVE_ACTION, msg: { target: 'Bob', reasoning: 'Confirmed wolf.', action_type: 'kill' }, expected: 'Used one-time kill on Bob. Reasoning: Confirmed wolf.' },
      { name: 'MANIAC_ACTION', type: MessageType.MANIAC_ACTION, msg: { target: 'Alice', reasoning: 'Block her.' }, expected: 'Abducted Alice for the night. Reasoning: Block her.' },
    ];

    ownMessageCases.forEach(({ name, type, msg, expected }) => {
      it(`formats own ${name} as an assistant turn`, () => {
        const messages: GameMessage[] = [
          gm('Take your action.', MessageType.GM_COMMAND),
          from(BOT, msg, type),
        ];

        const result = convertToAIMessages(BOT, messages);

        expect(result).toHaveLength(2);
        expect(result[0].role).toBe(MESSAGE_ROLE.USER);
        expect(result[1].role).toBe(MESSAGE_ROLE.ASSISTANT);
        expect(result[1].content).toBe(expected);
      });
    });

    it('propagates thinking and provider signatures onto the assistant turn', () => {
      const messages: GameMessage[] = [
        from(BOT, {
          reply: 'My answer.',
          thinking: 'internal reasoning',
          anthropicThinkingSignature: 'anthropic-sig',
          googleThoughtSignature: 'google-sig',
        }, MessageType.BOT_ANSWER),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        role: MESSAGE_ROLE.ASSISTANT,
        content: 'My answer.',
        thinking: 'internal reasoning',
        anthropicThinkingSignature: 'anthropic-sig',
        googleThoughtSignature: 'google-sig',
      });
    });

    it('leaves thinking/signatures undefined when not present', () => {
      const messages: GameMessage[] = [from(BOT, { reply: 'Plain answer.' }, MessageType.BOT_ANSWER)];

      const result = convertToAIMessages(BOT, messages);

      expect(result[0].thinking).toBeUndefined();
      expect(result[0].anthropicThinkingSignature).toBeUndefined();
      expect(result[0].googleThoughtSignature).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Other players' messages are gathered into the "Messages from Other Players"
  // block, formatted via convertMessageContent.
  // -------------------------------------------------------------------------
  describe('other players block', () => {
    it('formats another bot VOTE_MESSAGE with the vote template', () => {
      const messages: GameMessage[] = [
        gm('Discuss.', MessageType.GM_COMMAND),
        from(OTHER_BOT, { who: 'Bob', why: 'Too quiet.' }, MessageType.VOTE_MESSAGE),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('## Messages from Other Players');
      expect(result[0].content).toContain('**1. Bot A:** 🗳️ Votes for Bob: "Too quiet."');
    });

    it('preserves order across multiple other players', () => {
      const messages: GameMessage[] = [
        gm('Discuss.', MessageType.GM_COMMAND),
        from(OTHER_BOT, { reply: 'A speaks.' }, MessageType.BOT_ANSWER),
        from(HUMAN, 'Human speaks.', MessageType.HUMAN_PLAYER_MESSAGE),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result[0].content).toContain('**1. Bot A:** A speaks.');
      expect(result[0].content).toContain('**2. Human Player:** Human speaks.');
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication by hash: GM hashes on author+content, everyone else on author
  // alone, and only *consecutive* duplicates are dropped.
  // -------------------------------------------------------------------------
  describe('deduplication by hash', () => {
    it('drops consecutive identical GM messages', () => {
      const messages: GameMessage[] = [
        gm('Same command', MessageType.GM_COMMAND),
        gm('Same command', MessageType.GM_COMMAND),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Same command');
    });

    it('keeps consecutive GM messages with different content', () => {
      const messages: GameMessage[] = [
        gm('First', MessageType.GM_COMMAND),
        gm('Second', MessageType.GM_COMMAND),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result[0].content).toBe('First\n\nSecond');
    });

    it('drops consecutive messages from the same non-GM author regardless of content', () => {
      // Non-GM hash is author-only, so a second consecutive message from the
      // same author is treated as a duplicate and skipped.
      const messages: GameMessage[] = [
        gm('Discuss.', MessageType.GM_COMMAND),
        from(OTHER_BOT, { reply: 'First line.' }, MessageType.BOT_ANSWER),
        from(OTHER_BOT, { reply: 'Second line.' }, MessageType.BOT_ANSWER),
      ];

      const result = convertToAIMessages(BOT, messages);

      expect(result[0].content).toContain('**1. Bot A:** First line.');
      expect(result[0].content).not.toContain('Second line.');
      expect(result[0].content).not.toContain('**2.');
    });
  });
});

// ---------------------------------------------------------------------------
// convertMessageContent: the display/replay formatter for a single message.
// ---------------------------------------------------------------------------
describe('convertMessageContent', () => {
  const build = (msg: any, messageType: string): GameMessage => ({
    id: '1', recipientName: RECIPIENT_ALL, authorName: OTHER_BOT, msg, messageType, day: DAY, timestamp: 1000,
  });

  it('returns a string msg verbatim regardless of type', () => {
    expect(convertMessageContent(build('plain text', MessageType.GM_COMMAND))).toBe('plain text');
  });

  const cases: Array<[string, string, any, string]> = [
    ['VOTE_MESSAGE', MessageType.VOTE_MESSAGE, { who: 'Bob', why: 'shifty' }, '🗳️ Votes for Bob: "shifty"'],
    ['BOT_ANSWER', MessageType.BOT_ANSWER, { reply: 'hello' }, 'hello'],
    ['BOT_WELCOME', MessageType.BOT_WELCOME, { reply: 'intro' }, 'intro'],
    ['WEREWOLF_ACTION', MessageType.WEREWOLF_ACTION, { target: 'Bob', reasoning: 'weak' }, 'Selected Bob for elimination. Reasoning: weak'],
    ['DOCTOR_ACTION protect', MessageType.DOCTOR_ACTION, { target: 'Al', reasoning: 'risk' }, 'Protected Al from werewolf attacks. Reasoning: risk'],
    ['DOCTOR_ACTION kill', MessageType.DOCTOR_ACTION, { target: 'Eve', reasoning: 'wolf', action_type: 'kill' }, "Used Doctor's Mistake to kill Eve. Reasoning: wolf"],
    ['DETECTIVE_ACTION investigate', MessageType.DETECTIVE_ACTION, { target: 'Bob', reasoning: 'quiet' }, 'Investigated Bob. Reasoning: quiet'],
    ['DETECTIVE_ACTION kill', MessageType.DETECTIVE_ACTION, { target: 'Bob', reasoning: 'wolf', action_type: 'kill' }, 'Used one-time kill on Bob. Reasoning: wolf'],
    ['MANIAC_ACTION', MessageType.MANIAC_ACTION, { target: 'Al', reasoning: 'block' }, 'Abducted Al for the night. Reasoning: block'],
    ['GAME_STORY', MessageType.GAME_STORY, { story: 'the tale' }, 'the tale'],
    ['NIGHT_SUMMARY', MessageType.NIGHT_SUMMARY, { story: 'the dawn' }, 'the dawn'],
    ['SYSTEM_ERROR', MessageType.SYSTEM_ERROR, { error: 'Boom', details: 'stack' }, 'Boom: stack'],
    ['SYSTEM_WARNING', MessageType.SYSTEM_WARNING, { error: 'Heads up', details: 'careful' }, 'Heads up: careful'],
  ];

  cases.forEach(([name, type, msg, expected]) => {
    it(`formats ${name}`, () => {
      expect(convertMessageContent(build(msg, type))).toBe(expected);
    });
  });

  it('falls back to JSON.stringify for unknown object types', () => {
    const result = convertMessageContent(build({ foo: 'bar' }, 'SOME_UNKNOWN_TYPE'));
    expect(result).toBe('{"foo":"bar"}');
    expect(result).not.toContain('[object Object]');
  });
});