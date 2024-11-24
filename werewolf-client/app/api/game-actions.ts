'use server'

import {db} from "@/firebase/server";
import {firestore} from "firebase-admin";
import {
    Bot,
    BotPreview,
    Game,
    GAME_ROLES, GAME_STATES,
    GamePreview,
    GamePreviewWithGeneratedBots, User
} from "@/app/api/game-models";
import {getServerSession} from "next-auth";
import {AgentFactory} from "@/app/ai/agent-factory";
import {AbstractAgent} from "@/app/ai/abstract-agent";
import {GAME_MASTER, LLM_CONSTANTS, MESSAGE_ROLE, RECIPIENT_ALL} from "@/app/ai/ai-models";
import {STORY_SYSTEM_PROMPT, STORY_USER_PROMPT} from "@/app/ai/prompts/story-gen-prompts";
import {format} from "@/app/ai/prompts/utils";
import FieldValue = firestore.FieldValue;
import {getUserApiKeys} from "@/app/api/user-actions";
import {BOT_SYSTEM_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {BotAnswer} from "@/app/api/game-models";

export async function getAllGames(): Promise<Game[]> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const collectionRef = db.collection('games');
    const snapshot = await collectionRef.get();

    return snapshot.docs.map((doc) => gameFromFirestore(doc.id, doc.data()));
}

export async function removeGameById(id: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    const response = await db.collection('games').doc(id).delete();
    return "ok"
}

export async function getGame(gameId: string): Promise<Game | null> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();

    if (gameSnap.exists) {
        return gameFromFirestore(gameSnap.id, gameSnap.data());
    } else {
        return null;
    }
}

export async function previewGame(gamePreview: GamePreview): Promise<GamePreviewWithGeneratedBots> {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
        throw new Error('Not authenticated');
    }

    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const apiKeys = await getUserFromFirestore(session.user.email)
        .then((user) => getUserApiKeys(user!.email));

    const botCount = gamePreview.playerCount - 1; // exclude human player
    
    const userPrompt = format(STORY_USER_PROMPT, {
        theme: gamePreview.theme,
        description: gamePreview.description,
        excluded_name: gamePreview.name,
        number_of_players: botCount
    });

    const storyTellAgent: AbstractAgent = AgentFactory.createAgent(
        GAME_MASTER, STORY_SYSTEM_PROMPT, gamePreview.gameMasterAiType, apiKeys
    )
    const response = await storyTellAgent.ask([{
        recipientName: RECIPIENT_ALL, // not important here
        authorName: GAME_MASTER,
        role: MESSAGE_ROLE.USER, // GM is a user to bots
        msg: userPrompt
    }])

    if (!response) {
        throw new Error('Failed to get AI response');
    }

    const cleanResponse = cleanMarkdownResponse(response);
    const aiResponse = JSON.parse(cleanResponse);

    const bots: BotPreview[] = aiResponse.players.map((bot: { name: string; story: string }) => {
        let aiType = gamePreview.playersAiType;
        
        if (aiType === LLM_CONSTANTS.RANDOM) {
            // todo: support only models for which user has API keys
            const availableTypes = Object.values(LLM_CONSTANTS).filter(
                type => type !== LLM_CONSTANTS.RANDOM
            );
            aiType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        }

        return {
            name: bot.name,
            story: bot.story,
            playerAiType: aiType
        };
    });

    return {
        ...gamePreview,
        scene: aiResponse.scene,
        bots: bots
    };
}

export async function createGame(gamePreview: GamePreviewWithGeneratedBots): Promise<string|undefined> {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        const totalPlayers = gamePreview.playerCount;
        const werewolfCount = gamePreview.werewolfCount;
        
        // Create role distribution array
        const roleDistribution: string[] = [];
        if (gamePreview.specialRoles.includes(GAME_ROLES.DOCTOR)) {
            roleDistribution.push(GAME_ROLES.DOCTOR);
        }
        if (gamePreview.specialRoles.includes(GAME_ROLES.DETECTIVE)) {
            roleDistribution.push(GAME_ROLES.DETECTIVE);
        }
        roleDistribution.push(...Array(werewolfCount).fill(GAME_ROLES.WEREWOLF));    
        const villagersNeeded = totalPlayers - roleDistribution.length;
        roleDistribution.push(...Array(villagersNeeded).fill(GAME_ROLES.VILLAGER));

        // Shuffle the roles
        for (let i = roleDistribution.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roleDistribution[i], roleDistribution[j]] = [roleDistribution[j], roleDistribution[i]];
        }

        // Convert BotPreviews to Bots with roles
        const bots: Bot[] = gamePreview.bots.map((bot, index) => ({
            name: bot.name,
            story: bot.story,
            role: roleDistribution[index + 1],
            isAlive: true,
            aiType: bot.playerAiType
        }));

        // Create the game object
        const game: Game = {
            id: "", // This will be overwritten by Firestore
            description: gamePreview.description,
            theme: gamePreview.theme,
            werewolfCount: gamePreview.werewolfCount,
            specialRoles: gamePreview.specialRoles,
            gameMasterAiType: gamePreview.gameMasterAiType,
            story: gamePreview.scene,
            bots: bots,
            humanPlayerName: gamePreview.name,
            humanPlayerRole: roleDistribution[0],
            currentDay: 1,
            gameState: GAME_STATES.WELCOME,
            gameStateParamQueue: bots.map(bot => bot.name),  // Initialize with shuffled bot names
            gameStateProcessQueue: []
        };

        const response = await db.collection('games').add(game);

        await addMessageToChatAndSaveToDb(response.id, game.story, GAME_MASTER, RECIPIENT_ALL);
        return response.id;
    } catch (error: any) {
        console.error("Error adding document: ", error);
        throw new Error(`Failed to create game: ${error.message}`);
    }
}

export async function welcome(gameId: string): Promise<Game> {
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

        const session = await getServerSession();
        if (!session?.user?.email) {
            throw new Error('Not authenticated');
        }

        const apiKeys = await getUserFromFirestore(session.user.email)
            .then((user) => getUserApiKeys(user!.email));

        // todo: move to GM constants
        const gmMessage = `You are ${bot.name}. ${bot.story}. Introduce yourself to the group in 2-3 sentences.`;

        const formattedSystemPrompt = format(BOT_SYSTEM_PROMPT, {
            name: bot.name,
            personal_story: bot.story,
            temperament: "friendly", // You might want to generate or configure this
            role: bot.role,
            players_names: game.bots.filter(b => b.isAlive).map(b => b.name).concat([game.humanPlayerName]).join(", "),
            dead_players_names_with_roles: game.bots.filter(b => !b.isAlive).map(b => `${b.name} (${b.role})`).join(", "),
            reply_language_instruction: "English" // You might want to make this configurable
        });

        const agent = AgentFactory.createAgent(
            botName,
            formattedSystemPrompt,
            bot.aiType,
            apiKeys
        );

        // Get the bot's introduction
        const rawIntroduction = await agent.ask([{
            recipientName: bot.name,
            authorName: GAME_MASTER,
            role: MESSAGE_ROLE.USER,
            msg: 'Please introduce yourself to the group.' // todo: move to GM constants
        }]);

        //todo: pull message history from firestore

        if (!rawIntroduction) {
            throw new Error('Failed to get bot introduction');
        }

        const botAnswer = BotAnswer.fromRawResponse(rawIntroduction);
        await addMessageToChatAndSaveToDb(gameId, botAnswer.reply, botName, RECIPIENT_ALL);

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

export async function addMessageToChatAndSaveToDb(gameId: string, text: string, sender: string, recipient: string   ) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }
    try {
        // todo: Think if it makes sense to keep message in the games collection: `games/${gameId}/messages`
        const response = await db.collection('messages').add({
            text,
            sender,
            recipient,
            timestamp: FieldValue.serverTimestamp(),
            gameId
        });
        return response.id;
    } catch (error: any) {
        console.error("Error adding message: ", error);
        return { success: false, error: error.message };
    }
}

async function getUserFromFirestore(email: string) {
    if (!db) {
        throw new Error('Firestore is not initialized');
    }

    const userRef = db.collection('users').doc(email);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
        const userData = userSnap.data();

        const user: User = {
            name: userData?.name,
            email: userData?.email,
            apiKeys: userData?.ApiKeys || []
        };

        return user;
    } else {
        return null;
    }
}

function gameFromFirestore(id: string, data: any): Game {
    return {
        id,
        description: data.description,
        theme: data.theme,
        werewolfCount: data.werewolfCount,
        specialRoles: data.specialRoles,
        gameMasterAiType: data.gameMasterAiType,
        story: data.story,
        bots: data.bots,
        humanPlayerName: data.humanPlayerName,
        humanPlayerRole: data.humanPlayerRole,
        currentDay: data.currentDay,
        gameState: data.gameState,
        gameStateParamQueue: data.gameStateParamQueue,
        gameStateProcessQueue: data.gameStateProcessQueue
    };
}

function cleanMarkdownResponse(response: string): string {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
    }
    if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
    }
    return cleanResponse.trim();
}