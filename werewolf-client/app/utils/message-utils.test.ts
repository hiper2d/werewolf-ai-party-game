import { convertToAIMessages } from './message-utils';
import { GameMessage, MessageType, GAME_MASTER, MESSAGE_ROLE } from '@/app/api/game-models';
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
    it('should convert real game history with game story and multiple bot answers', () => {
        const gameHistory: GameMessage[] = [
            {
                "id": "zs1miB0qT4hYKPRL0yEz",
                "recipientName": "ALL",
                "authorName": "Game Master",
                "msg": "In the ruins of what was once a thriving district, the air is thick with tension and the scent of smoke. The annual Hunger Games are about to begin, and the tributes from each district are gathered, their fates intertwined in a deadly competition. The Capitol looms in the distance, a stark reminder of the power that controls their lives.",
                "messageType": "GAME_STORY",
                "day": 1,
                "timestamp": null
            },
            {
                "id": "bA7nOVG0jKBaDkvBpFND",
                "recipientName": "ALL",
                "authorName": "Blaze",
                "msg": {
                    "reply": "Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
                },
                "messageType": "BOT_ANSWER",
                "day": 1,
                "timestamp": 1739929097026
            },
            {
                "id": "4yDis2Kzzaf5v1y70pku",
                "recipientName": "ALL",
                "authorName": "Cinder",
                "msg": {
                    "reply": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
                },
                "messageType": "BOT_ANSWER",
                "day": 1,
                "timestamp": 1739929126609
            }
        ];

        const result = convertToAIMessages("Blaze", gameHistory);

        expect(result).toEqual([
            {
                role: 'user',
                content: "In the ruins of what was once a thriving district, the air is thick with tension and the scent of smoke. The annual Hunger Games are about to begin, and the tributes from each district are gathered, their fates intertwined in a deadly competition. The Capitol looms in the distance, a stark reminder of the power that controls their lives."
            },
            {
                role: 'assistant',
                content: "Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
            },
            {
                role: 'user',
                content: "Messages from other players:\nCinder: Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
            }
        ]);
    });

    it('should convert real game history messages correctly', () => {
        const gameMessages: GameMessage[] = [
            {
                "id": "zs1miB0qT4hYKPRL0yEz",
                "recipientName": "ALL",
                "authorName": "Game Master",
                "msg": {
                    "story": "In the ruins of what was once a thriving district, the air is thick with tension and the scent of smoke. The annual Hunger Games are about to begin, and the tributes from each district are gathered, their fates intertwined in a deadly competition. The Capitol looms in the distance, a stark reminder of the power that controls their lives."
                },
                "messageType": "GAME_STORY",
                "day": 1,
                "timestamp": null
            },
            {
                "id": "bA7nOVG0jKBaDkvBpFND",
                "recipientName": "ALL",
                "authorName": "Blaze",
                "msg": {
                    "reply": "Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
                },
                "messageType": "BOT_ANSWER",
                "day": 1,
                "timestamp": 1739929097026
            },
            {
                "id": "4yDis2Kzzaf5v1y70pku",
                "recipientName": "ALL",
                "authorName": "Cinder",
                "msg": {
                    "reply": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
                },
                "messageType": "BOT_ANSWER",
                "day": 1,
                "timestamp": 1739929126609
            }
        ];

        const result = convertToAIMessages("Blaze", gameMessages);

        expect(result).toEqual([
            {
                role: 'user',
                content: "In the ruins of what was once a thriving district, the air is thick with tension and the scent of smoke. The annual Hunger Games are about to begin, and the tributes from each district are gathered, their fates intertwined in a deadly competition. The Capitol looms in the distance, a stark reminder of the power that controls their lives."
            },
            {
                role: 'assistant',
                content: "Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
            },
            {
                role: 'user',
                content: "Messages from other players:\nCinder: Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
            }
        ]);
    });
});
