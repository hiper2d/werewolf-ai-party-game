import { convertToAIMessages } from './message-utils';
import { 
  AIMessage, 
  GameMessage, 
  GAME_MASTER, 
  MessageType, 
  MESSAGE_ROLE, 
  RECIPIENT_ALL 
} from '@/app/api/game-models';

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

Below are messages from the other players you haven't yet seen. Each message with it's own tag with the player name attribute:
<NewMessagesFromOtherPlayers>
  <Player name="Bot B">Hello everyone! I am the village doctor. I have been treating the sick and injured in this village for many years.</Player>
  <Player name="Human Player">Hi all! I am the tavern keeper. My tavern is the center of gossip in this village.</Player>
</NewMessagesFromOtherPlayers>
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

Below are messages from the other players you haven't yet seen. Each message with it's own tag with the player name attribute:
<NewMessagesFromOtherPlayers>
  <Player name="Bot A">Bot A introduction</Player>
</NewMessagesFromOtherPlayers>`);

      expect(result[1].role).toBe(MESSAGE_ROLE.ASSISTANT);
      expect(result[1].content).toBe('Bot C first message');

      expect(result[2].role).toBe(MESSAGE_ROLE.USER);
      expect(result[2].content).toBe(`A question from GM

A question for Bot C

Below are messages from the other players you haven't yet seen. Each message with it's own tag with the player name attribute:
<NewMessagesFromOtherPlayers>
  <Player name="Bot B">Bot B response</Player>
  <Player name="Human Player">Human player response</Player>
</NewMessagesFromOtherPlayers>`);
    });
  });
});