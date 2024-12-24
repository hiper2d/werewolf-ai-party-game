'use server';

import { db } from "@/firebase/server";
import { Bot, BotAnswer, GAME_MASTER, GAME_STATES, MessageType, GameMessage, Game } from "@/app/api/game-models";
import { GM_COMMAND_INTRODUCE_YOURSELF } from "@/app/ai/prompts/gm-commands";
import { BOT_SYSTEM_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { AgentFactory } from "@/app/ai/agent-factory";
import { getServerSession } from "next-auth";
import { format } from "@/app/ai/prompts/utils";
import { convertToAIMessages } from "@/app/utils/message-utils";
import {
    getGame,
    cleanMarkdownResponse,
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

        const agent = AgentFactory.createAgent(
            bot.name,
            botPrompt,
            bot.aiType,
            apiKeys
        );

        const gmMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_INTRODUCE_YOURSELF,
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Convert GameMessage to AIMessage before passing to agent
        const rawIntroduction = await agent.ask(convertToAIMessages(bot.name, [gmMessage]));
        if (!rawIntroduction) {
            throw new Error('Failed to get introduction from bot');
        }

        const botAnswer = cleanMarkdownResponse(rawIntroduction);

        const botMessage: GameMessage = {
            id: null,
            recipientName: 'ALL',
            authorName: bot.name,
            msg:
                typeof botAnswer === 'object' && 'reply' in botAnswer
                    ? new BotAnswer(botAnswer.reply)
                    : new BotAnswer(botAnswer),
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