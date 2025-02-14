import { convertToAIMessages } from './message-utils';
import { GameMessage, MessageType, GAME_MASTER } from '@/app/api/game-models';
import { GM_COMMAND_INTRODUCE_YOURSELF } from '@/app/ai/prompts/gm-commands';

describe('convertToAIMessages', () => {
    it('should convert a GM command message to AI message format', () => {
        const botName = 'TestBot';
        const gmMessage: GameMessage = {
            id: null,
            recipientName: botName,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_INTRODUCE_YOURSELF,
            messageType: MessageType.GM_COMMAND,
            day: 1,
            timestamp: Date.now()
        };

        const result = convertToAIMessages(botName, [gmMessage]);

        expect(result).toEqual([
            {
                role: 'user',
                content: GM_COMMAND_INTRODUCE_YOURSELF
            }
        ]);
    });

    it('should handle multiple consecutive GM messages by combining them', () => {
        const botName = 'TestBot';
        const gmMessages: GameMessage[] = [
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'First GM message',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'Second GM message',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            }
        ];

        const result = convertToAIMessages(botName, gmMessages);

        expect(result).toEqual([
            {
                role: 'user',
                content: 'First GM message\nSecond GM message'
            }
        ]);
    });

    it('should handle a conversation with GM messages, bot responses, and other player messages', () => {
        const botName = 'TestBot';
        const messages: GameMessage[] = [
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'GM command',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: 'ALL',
                authorName: 'Player1',
                msg: 'Hello everyone',
                messageType: MessageType.HUMAN_PLAYER_MESSAGE,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: 'ALL',
                authorName: botName,
                msg: { reply: 'Bot response' },
                messageType: MessageType.BOT_ANSWER,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'Another GM command',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            }
        ];

        const result = convertToAIMessages(botName, messages);

        expect(result).toEqual([
            {
                role: 'user',
                content: 'GM command\n\nMessages from other players:\nPlayer1: Hello everyone'
            },
            {
                role: 'assistant',
                content: 'Bot response'
            },
            {
                role: 'user',
                content: 'Another GM command'
            }
        ]);
    });

    it('should handle bot answers with reply object format', () => {
        const botName = 'TestBot';
        const messages: GameMessage[] = [
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'GM command',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: 'ALL',
                authorName: botName,
                msg: { reply: 'Bot response with reply object' },
                messageType: MessageType.BOT_ANSWER,
                day: 1,
                timestamp: Date.now()
            }
        ];

        const result = convertToAIMessages(botName, messages);

        expect(result).toEqual([
            {
                role: 'user',
                content: 'GM command'
            },
            {
                role: 'assistant',
                content: 'Bot response with reply object'
            }
        ]);
    });

    it('should handle remaining messages at the end of conversation', () => {
        const botName = 'TestBot';
        const messages: GameMessage[] = [
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'Initial GM command',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: 'ALL',
                authorName: 'Player1',
                msg: 'First player message',
                messageType: MessageType.HUMAN_PLAYER_MESSAGE,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: 'ALL',
                authorName: 'Player2',
                msg: 'Second player message',
                messageType: MessageType.HUMAN_PLAYER_MESSAGE,
                day: 1,
                timestamp: Date.now()
            },
            {
                id: null,
                recipientName: botName,
                authorName: GAME_MASTER,
                msg: 'Final GM command',
                messageType: MessageType.GM_COMMAND,
                day: 1,
                timestamp: Date.now()
            }
        ];

        const result = convertToAIMessages(botName, messages);

        expect(result).toEqual([
            {
                role: 'user',
                content: 'Initial GM command\nFinal GM command\n\nMessages from other players:\nPlayer1: First player message\nPlayer2: Second player message'
            }
        ]);
    });
});