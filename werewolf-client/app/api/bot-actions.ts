'use server';

import {db} from "@/firebase/server";
import {
    Bot,
    BotAnswer,
    Game,
    GAME_MASTER,
    GAME_STATES,
    GameMessage,
    MessageType,
    RECIPIENT_ALL
} from "@/app/api/game-models";
import {
    GM_COMMAND_INTRODUCE_YOURSELF,
    GM_COMMAND_REPLY_TO_DISCUSSION,
    GM_COMMAND_SELECT_RESPONDERS
} from "@/app/ai/prompts/gm-commands";
import {BOT_SYSTEM_PROMPT, BOT_VOTE_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {createBotAnswerSchema, createGmBotSelectionSchema, createBotVoteSchema} from "@/app/ai/prompts/ai-schemas";
import {AgentFactory} from "@/app/ai/agent-factory";
import {format} from "@/app/ai/prompts/utils";
import {auth} from "@/auth";
import {cleanResponse, convertToAIMessages, parseResponseToObj} from "@/app/utils/message-utils";
import {
    addMessageToChatAndSaveToDb,
    getBotMessages,
    getGame,
    getGameMessages,
    getUserFromFirestore
} from "./game-actions";
import {getUserApiKeys} from "./user-actions";

export async function welcome(gameId: string): Promise<Game> {
    const session = await auth();
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
                players_names: [
                    ...game.bots
                        .filter(b => b.name !== bot.name)
                        .map(b => b.name),
                    game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            }
        );

        const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);

        // Create the game master command message
        const gmMessage: GameMessage = {
            id: null,
            recipientName: bot.name,
            authorName: GAME_MASTER,
            msg: GM_COMMAND_INTRODUCE_YOURSELF,
            messageType: MessageType.GM_COMMAND,
            day: game.currentDay,
            timestamp: Date.now()
        };

        // Get messages for this bot (ALL + direct messages to this bot)
        const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

        // Create history from filtered messages, including the GM command that hasn't been saved yet
        const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
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

        // Save the game master command to the database first
        await addMessageToChatAndSaveToDb(gmMessage, gameId);
        
        // Then save the bot's response
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

export async function talkToAll(gameId: string, userMessage: string): Promise<Game> {
    // Common authentication and validation
    const session = await auth();
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
        // Case 1: Human player initiates discussion
        if (userMessage && game.gameStateProcessQueue.length === 0) {
            await handleHumanPlayerMessage(gameId, game, userMessage, session.user.email);
        }
        // Case 2: Process next bot in queue
        else if (game.gameStateProcessQueue.length > 0) {
            await processNextBotInQueue(gameId, game, session.user.email);
        }

        // Return updated game state
        return await getGame(gameId) as Game;
    } catch (error) {
        console.error('Error in talkToAll function:', error);
        throw error;
    }
}

/**
 * Handle the case when a human player initiates a discussion.
 * Saves the human message and selects bots to respond.
 * @private
 */
async function handleHumanPlayerMessage(
    gameId: string,
    game: Game,
    userMessage: string,
    userEmail: string
): Promise<void> {
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

    // Get all messages for the current day
    const messages = await getGameMessages(gameId);
    const dayMessages = messages.filter(m => m.day === game.currentDay);

    // Ask GM which bots should respond
    const apiKeys = await getUserFromFirestore(userEmail).then((user) => getUserApiKeys(user!.email));

    const gmPrompt = format(BOT_SYSTEM_PROMPT, {
        name: GAME_MASTER,
        personal_story: "You are the Game Master",
        temperament: "You are fair and balanced",
        role: "Game Master",
        players_names: [
            ...game.bots.map(b => b.name),
            game.humanPlayerName
        ].join(", "),
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

    // Include the user's message in the GM's history for bot selection
    const history = convertToAIMessages(GAME_MASTER, [...dayMessages, userChatMessage, gmMessage]);
    const schema = createGmBotSelectionSchema();

    const rawGmResponse = await gmAgent.askWithSchema(schema, history);
    if (!rawGmResponse) {
        throw new Error('Failed to get bot selection from GM');
    }

    const gmResponse = parseResponseToObj(rawGmResponse);
    if (!gmResponse.selected_bots || !Array.isArray(gmResponse.selected_bots)) {
        throw new Error('Invalid GM response format');
    }

    // Save the user's message to the database after successful GM response
    await addMessageToChatAndSaveToDb(userChatMessage, gameId);

    // Update game state with selected bots queue
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    await db.collection('games').doc(gameId).update({
        gameStateProcessQueue: gmResponse.selected_bots
    });
}

/**
 * Process the next bot in the queue to generate a response.
 * @private
 */
async function processNextBotInQueue(
    gameId: string,
    game: Game,
    userEmail: string
): Promise<void> {
    // Get the first bot from queue
    const botName = game.gameStateProcessQueue[0];
    const newQueue = game.gameStateProcessQueue.slice(1);
    if (botName === game.humanPlayerName) {
        // Update queue
        if (!db) {
            throw new Error('Firestore is not initialized');
        }
        await db.collection('games').doc(gameId).update({
            gameStateProcessQueue: newQueue
        });
        return;
    }

    // Find the bot
    const bot = game.bots.find(b => b.name === botName);
    if (!bot) {
        throw new Error(`Bot ${botName} not found in game`);
    }

    // Create the game master command message
    const gmMessage: GameMessage = {
        id: null,
        recipientName: bot.name,
        authorName: GAME_MASTER,
        msg: GM_COMMAND_REPLY_TO_DISCUSSION,
        messageType: MessageType.GM_COMMAND,
        day: game.currentDay,
        timestamp: Date.now()
    };

    // Save the game master command to the database
    await addMessageToChatAndSaveToDb(gmMessage, gameId);

    // Get messages for this bot (ALL + direct) using the optimized query
    const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);

    // Get bot's response
    const apiKeys = await getUserFromFirestore(userEmail)
        .then((user) => getUserApiKeys(user!.email));

    const botPrompt = format(BOT_SYSTEM_PROMPT, {
        name: bot.name,
        personal_story: bot.story,
        temperament: 'You have a balanced and thoughtful personality.',
        role: bot.role,
        players_names: [
            ...game.bots
                .filter(b => b.name !== bot.name)
                .map(b => b.name),
            game.humanPlayerName
        ].join(", "),
        dead_players_names_with_roles: game.bots
            .filter(b => !b.isAlive)
            .map(b => `${b.name} (${b.role})`)
            .join(", ")
    });

    const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);
    // Include the GM command in history without saving it yet
    const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
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

    // Save the game master command to the database first
    await addMessageToChatAndSaveToDb(gmMessage, gameId);
    
    // Then save the bot's response
    await addMessageToChatAndSaveToDb(botMessage, gameId);

    // Update queue
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    await db.collection('games').doc(gameId).update({
        gameStateProcessQueue: newQueue
    });
}

export async function vote(gameId: string): Promise<Game> {
    const session = await auth();
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
        // Mode 1: DAY_DISCUSSION state - Initialize voting
        if (game.gameState === GAME_STATES.DAY_DISCUSSION) {
            // Clean the queues
            const gameStateProcessQueue: string[] = [];
            const gameStateParamQueue: string[] = [];
            
            // Get all alive bot players
            const aliveBots = game.bots.filter(bot => bot.isAlive).map(bot => bot.name);
            
            // Add human player name
            const allPlayers = [...aliveBots, game.humanPlayerName];
            
            // Shuffle the list
            const shuffledPlayers = [...allPlayers].sort(() => Math.random() - 0.5);
            
            // Update game state
            await db.collection('games').doc(gameId).update({
                gameState: GAME_STATES.VOTE,
                gameStateProcessQueue: shuffledPlayers,
                gameStateParamQueue: gameStateParamQueue
            });
            
            return await getGame(gameId) as Game;
        }
        
        // Mode 2: VOTE state - Process voting
        else if (game.gameState === GAME_STATES.VOTE) {
            // Check if queue is empty
            if (game.gameStateProcessQueue.length === 0) {
                await db.collection('games').doc(gameId).update({
                    gameState: GAME_STATES.VOTE_RESULTS
                });
                return await getGame(gameId) as Game;
            }
            
            // Pop the first name from queue
            const currentVoter = game.gameStateProcessQueue[0];
            const newQueue = game.gameStateProcessQueue.slice(1);
            
            // If it's the human player, skip (will be handled in future task)
            if (currentVoter === game.humanPlayerName) {
                await db.collection('games').doc(gameId).update({
                    gameStateProcessQueue: newQueue
                });
                return await getGame(gameId) as Game;
            }
            
            // Find the bot
            const bot = game.bots.find(b => b.name === currentVoter);
            if (!bot) {
                throw new Error(`Bot ${currentVoter} not found in game`);
            }
            
            // Get all alive players for voting options
            const alivePlayerNames = [
                ...game.bots.filter(b => b.isAlive && b.name !== bot.name).map(b => b.name),
                game.humanPlayerName
            ];
            
            if (alivePlayerNames.length === 0) {
                throw new Error('No valid voting targets available');
            }
            
            // Get API keys and create bot agent
            const apiKeys = await getUserFromFirestore(session.user.email)
                .then((user) => getUserApiKeys(user!.email));
            
            const botPrompt = format(
                BOT_SYSTEM_PROMPT,
                {
                    name: bot.name,
                    personal_story: bot.story,
                    temperament: 'You have a balanced and thoughtful personality.',
                    role: bot.role,
                    players_names: [
                        ...game.bots
                            .filter(b => b.name !== bot.name)
                            .map(b => b.name),
                        game.humanPlayerName
                    ].join(", "),
                    dead_players_names_with_roles: game.bots
                        .filter(b => !b.isAlive)
                        .map(b => `${b.name} (${b.role})`)
                        .join(", ")
                }
            );
            
            const agent = AgentFactory.createAgent(bot.name, botPrompt, bot.aiType, apiKeys);
            
            // Create the voting command message
            const gmMessage: GameMessage = {
                id: null,
                recipientName: bot.name,
                authorName: GAME_MASTER,
                msg: BOT_VOTE_PROMPT,
                messageType: MessageType.GM_COMMAND,
                day: game.currentDay,
                timestamp: Date.now()
            };
            
            // Get messages for this bot
            const botMessages = await getBotMessages(gameId, bot.name, game.currentDay);
            
            // Create history including the voting command
            const history = convertToAIMessages(bot.name, [...botMessages, gmMessage]);
            const schema = createBotVoteSchema();
            
            const rawVoteResponse = await agent.askWithSchema(schema, history);
            if (!rawVoteResponse) {
                throw new Error('Failed to get vote from bot');
            }
            
            const voteResponse = parseResponseToObj(rawVoteResponse);
            if (!voteResponse.who || !voteResponse.why) {
                throw new Error('Invalid vote response format');
            }
            
            // Validate the vote target is alive and valid
            if (!alivePlayerNames.includes(voteResponse.who)) {
                // If invalid target, vote for a random valid target
                voteResponse.who = alivePlayerNames[Math.floor(Math.random() * alivePlayerNames.length)];
                voteResponse.why = "Voting for a suspicious player";
            }
            
            // Update voting results in gameStateParamQueue (as a map of names to vote counts)
            let votingResults: Record<string, number> = {};
            if (game.gameStateParamQueue.length > 0) {
                try {
                    votingResults = JSON.parse(game.gameStateParamQueue[0]);
                } catch (e) {
                    votingResults = {};
                }
            }
            
            // Add this vote
            votingResults[voteResponse.who] = (votingResults[voteResponse.who] || 0) + 1;
            
            // Save the vote as a message
            const voteMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_ALL,
                authorName: bot.name,
                msg: {
                    who: voteResponse.who,
                    why: voteResponse.why
                },
                messageType: MessageType.VOTE_MESSAGE,
                day: game.currentDay,
                timestamp: Date.now()
            };
            
            // Save the GM command first
            await addMessageToChatAndSaveToDb(gmMessage, gameId);
            
            // Then save the vote message
            await addMessageToChatAndSaveToDb(voteMessage, gameId);
            
            // Update game state
            await db.collection('games').doc(gameId).update({
                gameStateProcessQueue: newQueue,
                gameStateParamQueue: [JSON.stringify(votingResults)]
            });
            
            return await getGame(gameId) as Game;
        }
        
        else {
            throw new Error(`Invalid game state for voting: ${game.gameState}`);
        }
    } catch (error) {
        console.error('Error in vote function:', error);
        throw error;
    }
}