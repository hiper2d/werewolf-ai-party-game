import { BaseRoleProcessor, NightActionResult, NightState } from "./base-role-processor";
import { registerRoleProcessor } from "./role-processor-factory";
import {
    BotResponseError,
    GAME_MASTER,
    GAME_ROLES,
    GameMessage,
    MessageType,
    RECIPIENT_MANIAC,
    ManiacAbduction
} from "@/app/api/game-models";
import { AgentFactory } from "@/app/ai/agent-factory";
import { addMessageToChatAndSaveToDb, getBotMessages } from "@/app/api/game-actions";
import { getApiKeysForUser } from "@/app/utils/tier-utils";
import { auth } from "@/auth";
import { convertToAIMessages } from "@/app/utils/message-utils";
import { BOT_SYSTEM_PROMPT, BOT_MANIAC_ACTION_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { generateBotContextSection } from "@/app/utils/bot-utils";
import { ManiacActionZodSchema } from "@/app/ai/prompts/zod-schemas";
import { recordBotTokenUsage } from "@/app/api/cost-tracking";
import { getProviderSignatureFields } from "@/app/ai/ai-models";

/**
 * Maniac role processor
 * Handles maniac night actions (abduction of players)
 *
 * Key Rules:
 * - Acts FIRST in night order (before werewolves)
 * - Abducted player's night action fails
 * - Any role targeting abducted player fails
 * - If Maniac dies at night, abducted victim also dies
 * - Cannot abduct same player two nights in a row
 * - Abduction is NOT announced in morning narrative
 */
export class ManiacProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.MANIAC);
    }

    resolveNightAction(nightResults: any, state: NightState): void {
        if (nightResults.maniac && nightResults.maniac.target) {
            state.abductedPlayer = nightResults.maniac.target;
        }
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            const playersInfo = this.getPlayersWithRole();

            if (playersInfo.allPlayers.length === 0) {
                // No maniacs alive, skip this action
                this.logNightAction("No maniacs alive, skipping action");
                return { success: true };
            }

            // The gameStateParamQueue should already be populated by the generic night action logic
            if (this.game.gameStateParamQueue.length === 0) {
                this.logNightAction("No maniacs in action queue, skipping");
                return { success: true };
            }

            // Get the current maniac from the param queue
            const maniacName = this.game.gameStateParamQueue[0];
            const remainingQueue = this.game.gameStateParamQueue.slice(1);

            this.logNightAction(`Maniac (${maniacName}) is taking their night action`);

            // Get the maniac bot (skip if human player)
            const maniacBot = playersInfo.bots.find(bot => bot.name === maniacName);
            if (!maniacBot) {
                // If human maniac, skip for now (handled by UI)
                this.logNightAction(`HUMAN MANIAC DETECTED: Skipping auto-processing for human maniac: ${maniacName}`);
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
            const apiKeys = await getApiKeysForUser(session.user.email);

            // Create maniac prompt
            const maniacPrompt = format(BOT_SYSTEM_PROMPT, {
                name: maniacBot.name,
                personal_story: maniacBot.story,
                play_style: "",
                role: maniacBot.role,
                human_player_name: this.game.humanPlayerName,
                werewolf_teammates_section: '',
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== maniacBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", "),
                bot_context: generateBotContextSection(maniacBot, this.game)
            });

            // Create agent
            const agent = AgentFactory.createAgent(maniacBot.name, maniacPrompt, maniacBot.aiType, apiKeys, maniacBot.enableThinking || false);

            // Get all living players except the maniac for abduction
            const allLivePlayers = [
                ...this.game.bots.filter(bot => bot.isAlive && bot.name !== maniacBot.name).map(bot => bot.name),
                this.game.humanPlayerName
            ];

            // Check who was abducted last night (cannot abduct same target twice in a row)
            const previousAbductedTarget = this.game.previousNightResults?.maniac?.target || null;

            // Filter out the previous target if it exists
            const availableTargets = previousAbductedTarget
                ? allLivePlayers.filter(player => player !== previousAbductedTarget)
                : allLivePlayers;

            const targetNames = availableTargets.join(', ');

            // Create prompt with previous target restriction info
            let maniacActionPrompt = format(BOT_MANIAC_ACTION_PROMPT, { bot_name: maniacBot.name });

            if (previousAbductedTarget) {
                maniacActionPrompt += `\n\n**IMPORTANT RESTRICTION:** You abducted **${previousAbductedTarget}** last night. You CANNOT abduct the same player two nights in a row, so ${previousAbductedTarget} is NOT available as a target tonight.`;
            }

            maniacActionPrompt += `\n\n**Available targets for abduction:** ${targetNames}`;

            const gmMessage: GameMessage = {
                id: null,
                recipientName: maniacBot.name,
                authorName: GAME_MASTER,
                msg: maniacActionPrompt,
                messageType: MessageType.GM_COMMAND,
                day: this.game.currentDay,
                timestamp: Date.now()
            };

            // Get messages for this maniac bot
            const botMessages = await getBotMessages(this.gameId, maniacBot.name, this.game.currentDay);

            // Create conversation history
            const history = convertToAIMessages(maniacBot.name, [...botMessages, gmMessage]);

            const [maniacResponse, thinking, tokenUsage, thinkingSignature] = await agent.askWithZodSchema(ManiacActionZodSchema, history);

            if (!maniacResponse) {
                throw new Error(`Maniac ${maniacBot.name} failed to respond to abduction prompt`);
            }

            // Validate target - must be a living player AND not the same as last night
            if (!availableTargets.includes(maniacResponse.target)) {
                if (maniacResponse.target === previousAbductedTarget) {
                    throw new BotResponseError(
                        `Maniac cannot abduct same target twice in a row`,
                        `Maniac ${maniacBot.name} tried to abduct ${maniacResponse.target} again, but they abducted this player last night. Must choose a different target.`,
                        {
                            selectedTarget: maniacResponse.target,
                            previousTarget: previousAbductedTarget,
                            availableTargets: availableTargets,
                            maniacName: maniacBot.name
                        },
                        true
                    );
                } else if (!allLivePlayers.includes(maniacResponse.target)) {
                    throw new BotResponseError(
                        `Invalid maniac target: ${maniacResponse.target}`,
                        `The target must be a living player. Available targets: ${availableTargets.join(', ')}`,
                        {
                            selectedTarget: maniacResponse.target,
                            availableTargets: availableTargets,
                            maniacName: maniacBot.name
                        },
                        true
                    );
                } else {
                    throw new BotResponseError(
                        `Invalid maniac target: ${maniacResponse.target}`,
                        `The target is not available. Available targets: ${availableTargets.join(', ')}`,
                        {
                            selectedTarget: maniacResponse.target,
                            availableTargets: availableTargets,
                            previousTarget: previousAbductedTarget,
                            maniacName: maniacBot.name
                        },
                        true
                    );
                }
            }

            // Save the target to nightResults
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.MANIAC] = { target: maniacResponse.target };

            // Store abduction in maniac bot's roleKnowledge
            const abduction: ManiacAbduction = {
                day: this.game.currentDay,
                target: maniacResponse.target,
                success: true  // Will be updated later if needed
            };

            // Update the maniac bot's roleKnowledge
            const updatedBots = this.game.bots.map(bot => {
                if (bot.name === maniacBot.name) {
                    const existingAbductions = bot.roleKnowledge?.abductions || [];
                    return {
                        ...bot,
                        roleKnowledge: {
                            ...bot.roleKnowledge,
                            abductions: [...existingAbductions, abduction]
                        }
                    };
                }
                return bot;
            });

            // Create maniac response message (sent only to the maniac role)
            const maniacMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_MANIAC,
                authorName: maniacBot.name,
                msg: { ...maniacResponse, thinking: thinking || "", ...getProviderSignatureFields(maniacBot.aiType, thinkingSignature) },
                messageType: MessageType.MANIAC_ACTION,
                day: this.game.currentDay,
                timestamp: Date.now(),
                cost: tokenUsage?.costUSD
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(maniacMessage, this.gameId);

            if (tokenUsage) {
                await recordBotTokenUsage(this.gameId, maniacBot.name, tokenUsage, session.user.email);
            }

            this.logNightAction(`Maniac ${maniacBot.name} abducted: ${maniacResponse.target}`);

            return {
                success: true,
                gameUpdates: {
                    nightResults: currentNightResults,
                    gameStateParamQueue: remainingQueue,
                    bots: updatedBots
                }
            };

        } catch (error) {
            console.error('Error in ManiacProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in maniac action'
            };
        }
    }
}

// Register this processor
registerRoleProcessor(GAME_ROLES.MANIAC, ManiacProcessor);
