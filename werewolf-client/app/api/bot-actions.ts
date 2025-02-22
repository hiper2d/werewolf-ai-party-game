'use server';

import { db } from "@/firebase/server";
import { Bot, BotAnswer, GAME_MASTER, GAME_STATES, MessageType, GameMessage, Game, RECIPIENT_ALL } from "@/app/api/game-models";
import { GM_COMMAND_INTRODUCE_YOURSELF, GM_COMMAND_SELECT_RESPONDERS } from "@/app/ai/prompts/gm-commands";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { createBotAnswerSchema, createGmBotSelectionSchema } from "@/app/ai/prompts/ai-schemas";
import { AgentFactory } from "@/app/ai/agent-factory";
import { getServerSession } from "next-auth";
import { format } from "@/app/ai/prompts/utils";
import {cleanResponse, convertToAIMessages, parseResponseToObj} from "@/app/utils/message-utils";
import {
    getGame,
    addMessageToChatAndSaveToDb,
    getUserFromFirestore,
    getGameMessages
} from "./game-actions";
import { getUserApiKeys } from "./user-actions";

/**
 * Bot intro/welcome function, previously in game-actions.ts
 */
export async function welcome(gameId: string): Promise<Game> {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    try {
        // If queue is empty, move to DAY_DISCUSSION state
        if (game.gameStateParamQueue.length === 0) {
            await db.collection('games').doc(gameId).update({
                gameState: GAME_STATES.DAY_DISCUSSION
            });
            return await getGame(gameId) as Game;
        }

        // Get the first bot name and remove it from queue
        const botName = game.gameStateParamQueue[0];
        const newQueue = game.gameStateParamQueue.slice(1);

        // Find the bot in the game's bots array
        const bot: Bot | undefined = game.bots.find(b => b.name === botName);
        if (!bot) {
            throw new Error(`Bot ${botName} not found in game`);
        }

        const apiKeys = await getUserFromFirestore(session.user.email)
            .then((user) => getUserApiKeys(user!.email));

        const botPrompt = format(
            BOT_SYSTEM_PROMPT,
            {
                name: bot.name,
                personal_story: bot.story,
                temperament: 'You have a balanced and thoughtful personality.',
                role: bot.role,
                players_names: game.bots
                    .filter(b => b.name !== bot.name)
                    .map(b => b.name)
                    .join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            }
        );

        const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);

        const gmMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_INTRODUCE_YOURSELF,
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        const history = convertToAIMessages(bot.name, [gmMessage]);
        const schema = createBotAnswerSchema();
        const rawIntroduction = await agent.askWithSchema(schema, history);
        if (!rawIntroduction) {
            throw new Error('Failed to get introduction from bot');
        }

        const cleanAnswer = cleanResponse(rawIntroduction);
        let answer: BotAnswer;
        try {
            answer = JSON.parse(cleanAnswer);
        } catch (e: any) {
            throw new Error(`Failed to parse JSON, returning as string: ${e.message}`);
        }

        const botMessage: GameMessage = {
            id: null,
            recipientName: RECIPIENT_ALL,
            authorName: bot.name,
            msg: { reply: answer.reply },
            messageType: MessageType.BOT_ANSWER,
            day: game.currentDay,
            timestamp: Date.now()
        };

        await addMessageToChatAndSaveToDb(botMessage, gameId);

        // Update game with the modified queue
        await db.collection('games').doc(gameId).update({
            gameStateParamQueue: newQueue
        });

        // Return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in welcome function:', error);
        throw error;
    }
}

/**
 * Send a user message to all bots in the game (one by one), collecting replies.
 * The user message is saved to chat, and each bot reply is also saved to chat.
 */
export async function talkToAll(gameId: string, userMessage: string): Promise<Game> {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    // Fetch the current game
    const game = await getGame(gameId);
    if (!game) {
        throw new Error('Game not found');
    }

    // Validate game state
    if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
        throw new Error('Game is not in DAY_DISCUSSION state');
    }

    try {
        // Handle empty queue case
        if (game.gameStateProcessQueue.length === 0 && userMessage) {
            // Save the user's message to chat
            const userChatMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_ALL,
                authorName: game.humanPlayerName,
                msg: userMessage,
                messageType: MessageType.HUMAN_PLAYER_MESSAGE,
                day: game.currentDay,
                timestamp: Date.now()
            };
            await addMessageToChatAndSaveToDb(userChatMessage, gameId);

            // Get all messages for the current day
            const messages = await getGameMessages(gameId);
            const dayMessages = messages.filter(m => m.day === game.currentDay);

            // Ask GM which bots should respond
            const apiKeys = await getUserFromFirestore(session.user.email)
                .then((user) => getUserApiKeys(user!.email));

            const gmPrompt = format(BOT_SYSTEM_PROMPT, {
                name: GAME_MASTER,
                personal_story: "You are the Game Master",
                temperament: "You are fair and balanced",
                role: "Game Master",
                players_names: game.bots.map(b => b.name).join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            });

            const gmAgent = AgentFactory.createAgent(GAME_MASTER, gmPrompt, game.gameMasterAiType, apiKeys);
            const gmMessage: GameMessage = {
                id: null,
                recipientName: GAME_MASTER,
                authorName: GAME_MASTER,
                msg: GM_COMMAND_SELECT_RESPONDERS,
                messageType: MessageType.GM_COMMAND,
                day: game.currentDay,
                timestamp: Date.now()
            };

            const history = convertToAIMessages(GAME_MASTER, [...dayMessages, gmMessage]);
            const schema = createGmBotSelectionSchema();
            const rawGmResponse = await gmAgent.askWithSchema(schema, history);
            if (!rawGmResponse) {
                throw new Error('Failed to get bot selection from GM');
            }

            const gmResponse = parseResponseToObj(rawGmResponse);
            if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
                throw new Error('Invalid GM response format');
            }

            // Update game state with selected bots queue
            await db.collection('games').doc(gameId).update({
                gameStateProcessQueue: gmResponse.selected_bots
            });

        } else if (game.gameStateProcessQueue.length > 0) {
            // Get the first bot from queue
            const botName = game.gameStateProcessQueue[0];
            const newQueue = game.gameStateProcessQueue.slice(1);

            // Find the bot
            const bot = game.bots.find(b => b.name === botName);
            if (!bot) {
                throw new Error(`Bot ${botName} not found in game`);
            }

            // Get messages for this bot (ALL + direct)
            const messages = await getGameMessages(gameId);
            const botMessages = messages.filter(m => 
                m.day === game.currentDay && 
                (m.recipientName === RECIPIENT_ALL || m.recipientName === bot.name)
            );

            // Get bot's response
            const apiKeys = await getUserFromFirestore(session.user.email)
                .then((user) => getUserApiKeys(user!.email));

            const botPrompt = format(BOT_SYSTEM_PROMPT, {
                name: bot.name,
                personal_story: bot.story,
                temperament: 'You have a balanced and thoughtful personality.',
                role: bot.role,
                players_names: game.bots
                    .filter(b => b.name !== bot.name)
                    .map(b => b.name)
                    .join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            });

            const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);
            const history = convertToAIMessages(bot.name, botMessages);
            const schema = createBotAnswerSchema();
            const rawBotReply = await agent.askWithSchema(schema, history);
            if (!rawBotReply) {
                throw new Error('Failed to get response from bot');
            }

            const botReply = parseResponseToObj(rawBotReply);
            const botMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_ALL,
                authorName: bot.name,
                msg: { reply: botReply.reply },
                messageType: MessageType.BOT_ANSWER,
                day: game.currentDay,
                timestamp: Date.now()
            };

            await addMessageToChatAndSaveToDb(botMessage, gameId);

            // Update queue
            await db.collection('games').doc(gameId).update({
                gameStateProcessQueue: newQueue
            });
        }

        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in talkToAll function:', error);
        throw error;
    }
}