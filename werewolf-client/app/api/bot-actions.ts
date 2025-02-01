'use server';

import { db } from "@/firebase/server";
import { Bot, BotAnswer, GAME_MASTER, GAME_STATES, MessageType, GameMessage, Game } from "@/app/api/game-models";
import { GM_COMMAND_INTRODUCE_YOURSELF } from "@/app/ai/prompts/gm-commands";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { AgentFactory } from "@/app/ai/agent-factory";
import { getServerSession } from "next-auth";
import { format } from "@/app/ai/prompts/utils";
import {cleanResponse, convertToAIMessages, parseResponseToObj} from "@/app/utils/message-utils";
import {
    getGame,
    addMessageToChatAndSaveToDb,
    getUserFromFirestore
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
        const rawIntroduction = await agent.ask(history);
        if (!rawIntroduction) {
            throw new Error('Failed to get introduction from bot');
        }

        const cleanAnswer = cleanResponse(rawIntroduction);
        let answer: BotAnswer;
        try {
            answer = JSON.parse(cleanAnswer) as BotAnswer;
        } catch (e: any) {
            throw new Error(`Failed to parse JSON, returning as string: ${e.message}`);
        }

        const botMessage: GameMessage = {
            id: null,
            recipientName: 'ALL',
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

    // Save the user's message to the chat
    const userChatMessage: GameMessage = {
        id: null,
        recipientName: 'ALL',
        // Here we use the session user email or name as the message author
        authorName: session.user.email ?? 'Unknown User',
        msg: userMessage,
        messageType: MessageType.HUMAN_PLAYER_MESSAGE,
        day: game.currentDay,
        timestamp: Date.now()
    };
    await addMessageToChatAndSaveToDb(userChatMessage, gameId);

    try {
        // For each (alive) bot in the game, produce a response
        for (const bot of game.bots.filter(b => b.isAlive)) {
            // Retrieve user-specific API keys
            const apiKeys = await getUserFromFirestore(session.user.email)
                .then((user) => getUserApiKeys(user!.email));

            // Construct the system prompt for the bot
            const botSystemPrompt = format(
                BOT_SYSTEM_PROMPT,
                {
                    name: bot.name,
                    personal_story: bot.story,
                    temperament: 'You have a balanced and thoughtful personality.',
                    role: bot.role,
                    players_names: game.bots
                        .filter(bOther => bOther.name !== bot.name)
                        .map(bOther => bOther.name)
                        .join(", "),
                    dead_players_names_with_roles: game.bots
                        .filter(bDead => !bDead.isAlive)
                        .map(bDead => `${bDead.name} (${bDead.role})`)
                        .join(", ")
                }
            );

            // Create the bot's agent
            const agent = AgentFactory.createAgent(
                bot.name,
                botSystemPrompt,
                bot.aiType,
                apiKeys
            );

            // The user message is effectively the "latest chat" text to the bot
            // We'll treat it as a normal user message
            const chatMessage: GameMessage = {
                id: null,
                recipientName: bot.name,
                authorName: session.user.email ?? 'Unknown User',
                msg: userMessage,
                messageType: MessageType.HUMAN_PLAYER_MESSAGE,
                day: game.currentDay,
                timestamp: Date.now()
            };

            // Ask the bot
            const rawBotReply = await agent.ask(convertToAIMessages(bot.name, [chatMessage]));
            if (!rawBotReply) {
                continue; // If no reply for any reason, skip
            }
            const botReply = parseResponseToObj(rawBotReply) as BotAnswer;

            // Save the bot reply to the chat
            const botMessage: GameMessage = {
                id: null,
                recipientName: 'ALL',
                authorName: bot.name,
                msg:
                    typeof botReply === 'object' && 'reply' in botReply
                        ? new BotAnswer(botReply.reply)
                        : new BotAnswer(botReply),
                messageType: MessageType.BOT_ANSWER,
                day: game.currentDay,
                timestamp: Date.now()
            };
            await addMessageToChatAndSaveToDb(botMessage, gameId);
        }

        // Finally, return the updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in talkToAll function:', error);
        throw error;
    }
} 