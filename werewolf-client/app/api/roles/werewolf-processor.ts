import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES, RECIPIENT_WEREWOLVES, GAME_MASTER, GameMessage, MessageType, BotAnswer } from "@/app/api/game-models";
import { AgentFactory } from "@/app/ai/agent-factory";
import { addMessageToChatAndSaveToDb, getBotMessages, getUserFromFirestore } from "@/app/api/game-actions";
import { getUserApiKeys } from "@/app/api/user-actions";
import { generatePlayStyleDescription } from "@/app/utils/bot-utils";
import { auth } from "@/auth";
import { convertToAIMessages, parseResponseToObj } from "@/app/utils/message-utils";
import { BOT_SYSTEM_PROMPT, BOT_WEREWOLF_ACTION_PROMPT, BOT_WEREWOLF_DISCUSSION_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { createWerewolfActionSchema, WerewolfAction, createBotAnswerSchema } from "@/app/ai/prompts/ai-schemas";
import { db } from "@/firebase/server";

/**
 * Werewolf role processor
 * Handles werewolf night actions (elimination of other players)
 */
export class WerewolfProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.WEREWOLF);
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            // First, announce that it's the werewolves' turn
            await this.announceRoleTurn();

            const playersInfo = this.getPlayersWithRole();
            
            if (playersInfo.allPlayers.length === 0) {
                // No werewolves alive, skip this action
                this.logNightAction("No werewolves alive, skipping action");
                return { success: true };
            }

            // Log the werewolves taking action
            const werewolfNames = playersInfo.allPlayers.map(p => p.name).join(', ');
            this.logNightAction(`Werewolves (${werewolfNames}) are taking their night action`);

            // Check if queue initialization is needed
            if (this.game.gameStateParamQueue.length === 0) {
                // Phase 1: Initialize queue with werewolf names
                this.logNightAction("Initializing werewolf action queue");
                
                // Create list of werewolf names in random order
                let werewolfNames = playersInfo.allPlayers.map(p => p.name);
                werewolfNames = werewolfNames.sort(() => Math.random() - 0.5);
                
                // If there are multiple werewolves, duplicate the list so each name appears twice
                if (werewolfNames.length > 1) {
                    werewolfNames = [...werewolfNames, ...werewolfNames];
                }
                
                this.logNightAction(`Initialized queue with werewolves: ${werewolfNames.join(', ')}`);
                return { 
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: werewolfNames
                    }
                };
            }
            
            // Phase 2: Process next werewolf action
            const currentWerewolfName = this.game.gameStateParamQueue[0];
            const remainingQueue = this.game.gameStateParamQueue.slice(1);
            
            this.logNightAction(`Processing action for werewolf: ${currentWerewolfName}`);
            
            // Get the werewolf bot (skip if human player)
            const werewolfBot = playersInfo.bots.find(bot => bot.name === currentWerewolfName);
            if (!werewolfBot) {
                // If human werewolf, skip for now (would need UI implementation)
                this.logNightAction(`Skipping human werewolf: ${currentWerewolfName}`);
                
                if (remainingQueue.length === 0) {
                    this.logNightAction("Werewolf phase completed");
                }
                
                return { 
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: remainingQueue
                    }
                };
            }
            
            // Get authentication for API calls
            const session = await auth();
            if (!session || !session.user?.email) {
                throw new Error('Not authenticated');
            }
            
            // Get API keys
            const user = await getUserFromFirestore(session.user.email);
            const apiKeys = await getUserApiKeys(user!.email);
            
            // Create werewolf prompt
            const werewolfPrompt = format(BOT_SYSTEM_PROMPT, {
                name: werewolfBot.name,
                personal_story: werewolfBot.story,
                play_style: generatePlayStyleDescription(werewolfBot),
                role: werewolfBot.role,
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== werewolfBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            });
            
            // Create agent
            const agent = AgentFactory.createAgent(werewolfBot.name, werewolfPrompt, werewolfBot.aiType, apiKeys);
            
            // Determine if this is the last werewolf in queue (decision maker)
            const isLastWerewolf = remainingQueue.length === 0;
            
            let gmMessage: GameMessage;
            let schema: any;
            let responseType: string;
            
            if (isLastWerewolf) {
                // Last werewolf makes the final decision
                const targetablePlayers = this.getTargetablePlayers(true); // Exclude werewolves
                const targetNames = targetablePlayers.map(p => p.name).join(', ');
                
                const werewolfActionPrompt = `${BOT_WEREWOLF_ACTION_PROMPT}\n\n**Available targets:** ${targetNames}`;
                
                gmMessage = {
                    id: null,
                    recipientName: werewolfBot.name,
                    authorName: GAME_MASTER,
                    msg: werewolfActionPrompt,
                    messageType: MessageType.GM_COMMAND,
                    day: this.game.currentDay,
                    timestamp: Date.now()
                };
                
                schema = createWerewolfActionSchema();
                responseType = 'WerewolfAction';
            } else {
                // Regular werewolf discussion
                gmMessage = {
                    id: null,
                    recipientName: werewolfBot.name,
                    authorName: GAME_MASTER,
                    msg: BOT_WEREWOLF_DISCUSSION_PROMPT,
                    messageType: MessageType.GM_COMMAND,
                    day: this.game.currentDay,
                    timestamp: Date.now()
                };
                
                schema = createBotAnswerSchema();
                responseType = 'BotAnswer';
            }
            
            // Get messages for this werewolf bot
            const botMessages = await getBotMessages(this.gameId, werewolfBot.name, this.game.currentDay);
            
            // Create conversation history
            const history = convertToAIMessages(werewolfBot.name, [...botMessages, gmMessage]);
            
            const rawResponse = await agent.askWithSchema(schema, history);
            
            if (!rawResponse) {
                throw new Error(`Werewolf ${werewolfBot.name} failed to respond to ${isLastWerewolf ? 'action' : 'discussion'} prompt`);
            }
            
            const werewolfResponse = parseResponseToObj(rawResponse, responseType);
            
            // Create werewolf response message with WEREWOLVES recipient
            const werewolfMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_WEREWOLVES,
                authorName: werewolfBot.name,
                msg: werewolfResponse,
                messageType: MessageType.BOT_ANSWER,
                day: this.game.currentDay,
                timestamp: Date.now()
            };
            
            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(werewolfMessage, this.gameId);
            
            // Check if this was the last werewolf in the queue
            if (remainingQueue.length === 0) {
                this.logNightAction("Werewolf phase completed");
            }
            
            if (isLastWerewolf) {
                this.logNightAction(`Werewolf ${werewolfBot.name} selected target: ${(werewolfResponse as WerewolfAction).target}`);
            } else {
                this.logNightAction(`Werewolf ${werewolfBot.name} contributed to discussion`);
            }

            return {
                success: true,
                gameUpdates: {
                    gameStateParamQueue: remainingQueue
                }
            };

        } catch (error) {
            console.error('Error in WerewolfProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in werewolf action'
            };
        }
    }

}