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
        
        // 2. GM asks bot A to introduce itself
        {
          id: '2',
          recipientName: BOT_A,
          authorName: GAME_MASTER,
          msg: 'Welcome to the game! Please introduce yourself to the group.',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 2000
        },
        
        // 3. Bot A introduces himself to everybody
        {
          id: '3',
          recipientName: RECIPIENT_ALL,
          authorName: BOT_A,
          msg: { reply: 'Greetings, fellow villagers! I am the blacksmith of this village. I forge tools and weapons for our community.' },
          messageType: MessageType.BOT_ANSWER,
          day: CURRENT_DAY,
          timestamp: 3000
        },
        
        // 4. GM asks bot B to introduce himself
        {
          id: '4',
          recipientName: BOT_B,
          authorName: GAME_MASTER,
          msg: 'Welcome to the game! Please introduce yourself to the group.',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 4000
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
        }
      ];
      
      // Convert messages for Bot C
      const result = convertToAIMessages(BOT_C, messages);
      
      // Basic assertions
      expect(result.length).toBe(3);
      
      // All messages should have the correct role (user for GM messages)
      result.forEach(msg => {
        expect(msg.role).toBe(MESSAGE_ROLE.USER);
      });
      
      // The final message to Bot C should include Bot B and Human Player introductions
      // (but not Bot A, as it was included in an earlier message)
      const finalMessage = result[result.length - 1];
      
      // Check that the final message includes Bot B and Human Player introductions
      expect(finalMessage.content).toContain('Bot B');
      expect(finalMessage.content).toContain('doctor');
      expect(finalMessage.content).toContain('Human Player');
      expect(finalMessage.content).toContain('tavern keeper');
      
      // Check that the second message includes Bot A's introduction
      expect(result[1].content).toContain('Bot A');
      expect(result[1].content).toContain('blacksmith');
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
        
        // GM asks bot A to introduce itself with multiple messages
        {
          id: '3',
          recipientName: BOT_A,
          authorName: GAME_MASTER,
          msg: 'First part of introduction request.',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 3000
        },
        {
          id: '4',
          recipientName: BOT_A,
          authorName: GAME_MASTER,
          msg: 'Second part of introduction request.',
          messageType: MessageType.GM_COMMAND,
          day: CURRENT_DAY,
          timestamp: 4000
        },
        
        // Bot A responds
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
      
      // Basic assertions
      expect(result.length).toBe(4);
      
      // Verify message roles alternate correctly
      expect(result[0].role).toBe(MESSAGE_ROLE.USER);    // GM
      expect(result[1].role).toBe(MESSAGE_ROLE.ASSISTANT); // Bot C
      expect(result[2].role).toBe(MESSAGE_ROLE.USER);    // GM
      expect(result[3].role).toBe(MESSAGE_ROLE.USER);    // GM
      
      // Verify Bot C's message content
      expect(result[1].content).toBe('Bot C first message');
      
      // Verify that the final message includes all necessary content
      const finalMessage = result[result.length - 1];
      expect(finalMessage.content).toContain('A question for Bot C');
      expect(finalMessage.content).toContain('Bot B response');
      expect(finalMessage.content).toContain('Human player response');
    });
  });
});