import {BaseRoleProcessor, NightActionResult, NightState, RolePlayersInfo} from "./base-role-processor";
import {registerRoleProcessor} from "./role-processor-factory";
import {
    BotAnswer,
    BotResponseError,
    GAME_MASTER,
    GAME_ROLES,
    GameMessage,
    MessageType,
    RECIPIENT_WEREWOLVES
} from "@/app/api/game-models";
import {AgentFactory} from "@/app/ai/agent-factory";
import {addMessageToChatAndSaveToDb, getBotMessages} from "@/app/api/game-actions";
import {getApiKeysForUser} from "@/app/utils/tier-utils";
import {generateBotContextSection, generateWerewolfTeammatesSection} from "@/app/utils/bot-utils";
import {auth} from "@/auth";
import {convertToAIMessages} from "@/app/utils/message-utils";
import {
    BOT_SYSTEM_PROMPT,
    BOT_WEREWOLF_ACTION_PROMPT,
    BOT_WEREWOLF_DISCUSSION_PROMPT
} from "@/app/ai/prompts/bot-prompts";
import {format} from "@/app/ai/prompts/utils";
import {BotAnswerZodSchema, WerewolfActionZod, WerewolfActionZodSchema} from "@/app/ai/prompts/zod-schemas";
import {recordBotTokenUsage} from "@/app/api/cost-tracking";
import {getProviderSignatureFields} from "@/app/ai/ai-models";

/**
 * Werewolf role processor
 * Handles werewolf night actions (elimination of other players)
 */
export class WerewolfProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.WEREWOLF);
    }

    computeIntermediateNightState(nightResults: Record<string, any>, state: NightState): NightState {
        // No target was chosen (sole wolf abducted — handled in processNightAction)
        if (!nightResults.werewolf || !nightResults.werewolf.target) {
            return state;
        }

        const werewolfTarget = nightResults.werewolf.target;

        // Target was abducted — werewolf attack fails
        if (state.abductedPlayer === werewolfTarget) {
            state.actionsPrevented.push({
                role: GAME_ROLES.WEREWOLF,
                reason: 'abduction',
                player: null // Pack action blocked because target was abducted
            });
            this.logNightAction(`Werewolf attack on ${werewolfTarget} failed - target was abducted by Maniac`);
            return state;
        }

        // Add werewolf kill to deaths (doctor may remove it later)
        const victimRole = this.resolvePlayerRole(werewolfTarget);
        state.deaths.push({ player: werewolfTarget, role: victimRole, cause: 'werewolf_attack' });

        // If victim is the maniac, their abducted victim also dies
        if (victimRole === GAME_ROLES.MANIAC && state.abductedPlayer) {
            const collateralRole = this.resolvePlayerRole(state.abductedPlayer);
            state.deaths.push({ player: state.abductedPlayer, role: collateralRole, cause: 'maniac_collateral' });
            this.logNightAction(`Maniac killed by werewolves - abducted victim ${state.abductedPlayer} also dies`);
        }
        return state;
    }

    /**
     * Override to handle werewolf coordination logic
     * For multiple werewolves, duplicate the list to allow coordination phase
     */
    protected createParamQueue(playersInfo: RolePlayersInfo): string[] {
        const playersWithRole: string[] = [];

        // Add all werewolf players
        playersInfo.allPlayers.forEach(player => {
            playersWithRole.push(player.name);
        });

        // Randomize the order
        playersWithRole.sort(() => Math.random() - 0.5);

        // For werewolves, duplicate the list if multiple werewolves exist (for coordination phase)
        let paramQueue: string[] = [];
        if (playersWithRole.length > 1) {
            paramQueue = [...playersWithRole, ...playersWithRole];
        } else {
            paramQueue = [...playersWithRole];
        }

        return paramQueue;
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            const playersInfo = this.getPlayersWithRole();

            if (playersInfo.allPlayers.length === 0) {
                // No werewolves alive, skip this action
                this.logNightAction("No werewolves alive, skipping action");
                return { success: true };
            }

            // If the sole remaining werewolf is abducted, skip the entire werewolf turn
            const baseNightState = this.getBaseNightState();
            if (playersInfo.allPlayers.length === 1 && baseNightState.abductedPlayer === playersInfo.allPlayers[0].name) {
                const soleName = playersInfo.allPlayers[0].name;
                this.logNightAction(`Sole werewolf ${soleName} was abducted by Maniac — skipping entire werewolf turn`);
                baseNightState.actionsPrevented.push({
                    role: GAME_ROLES.WEREWOLF,
                    reason: 'abduction',
                    player: soleName
                });
                return {
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: [],
                        resolvedNightState: baseNightState
                    }
                };
            }

            // Log the werewolves taking action
            const werewolfNames = playersInfo.allPlayers.map(p => p.name).join(', ');
            this.logNightAction(`Werewolves (${werewolfNames}) are taking their night action`);

            // The gameStateParamQueue should already be populated by the generic night action logic
            if (this.game.gameStateParamQueue.length === 0) {
                throw new BotResponseError(
                    "No werewolves in action queue",
                    "The gameStateParamQueue should have been populated with werewolf names by the night action initialization. This indicates a system error.",
                    {
                        gameState: this.game.gameState,
                        currentDay: this.game.currentDay,
                        processQueue: this.game.gameStateProcessQueue,
                        paramQueue: this.game.gameStateParamQueue,
                        alivePlayers: this.game.bots.filter(bot => bot.isAlive).map(bot => bot.name)
                    },
                    true
                );
            }

            // Process next werewolf action
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
            const apiKeys = await getApiKeysForUser(session.user.email);

            // Create werewolf prompt
            const werewolfPrompt = format(BOT_SYSTEM_PROMPT, {
                name: werewolfBot.name,
                personal_story: werewolfBot.story,
                play_style: "",
                role: werewolfBot.role,
                human_player_name: this.game.humanPlayerName,
                werewolf_teammates_section: generateWerewolfTeammatesSection(werewolfBot, this.game),
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== werewolfBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", "),
                bot_context: generateBotContextSection(werewolfBot, this.game)
            });

            // Create agent
            const agent = AgentFactory.createAgent(werewolfBot.name, werewolfPrompt, werewolfBot.aiType, apiKeys, werewolfBot.enableThinking || false);

            // Determine if this is the last werewolf in queue (decision maker)
            const isLastWerewolf = remainingQueue.length === 0;

            let gmMessage: GameMessage;
            let schema: any;
            let responseType: string;

            if (isLastWerewolf) {
                // Last werewolf makes the final decision
                const targetablePlayers = this.getTargetablePlayers(true); // Exclude werewolves
                const targetNames = targetablePlayers.map(p => p.name).join(', ');

                const werewolfActionPrompt = `${format(BOT_WEREWOLF_ACTION_PROMPT, { bot_name: werewolfBot.name })}\n\n**Available targets:** ${targetNames}`;

                gmMessage = {
                    id: null,
                    recipientName: werewolfBot.name,
                    authorName: GAME_MASTER,
                    msg: werewolfActionPrompt,
                    messageType: MessageType.GM_COMMAND,
                    day: this.game.currentDay,
                    timestamp: Date.now()
                };

                schema = WerewolfActionZodSchema;
                responseType = 'WerewolfAction';
            } else {
                // Regular werewolf discussion
                gmMessage = {
                    id: null,
                    recipientName: werewolfBot.name,
                    authorName: GAME_MASTER,
                    msg: format(BOT_WEREWOLF_DISCUSSION_PROMPT, { bot_name: werewolfBot.name }),
                    messageType: MessageType.GM_COMMAND,
                    day: this.game.currentDay,
                    timestamp: Date.now()
                };

                schema = BotAnswerZodSchema;
                responseType = 'BotAnswer';
            }

            // Get messages for this werewolf bot
            const botMessages = await getBotMessages(this.gameId, werewolfBot.name, this.game.currentDay);

            // Create conversation history
            const history = convertToAIMessages(werewolfBot.name, [...botMessages, gmMessage]);

            const [werewolfResponse, thinking, tokenUsage, thinkingSignature] = await agent.askWithZodSchema(schema, history);

            if (!werewolfResponse) {
                throw new Error(`Werewolf ${werewolfBot.name} failed to respond to ${isLastWerewolf ? 'action' : 'discussion'} prompt`);
            }

            // Validate and save target if this is the final werewolf decision
            let gameUpdates: any = {
                gameStateParamQueue: remainingQueue
            };

            if (isLastWerewolf) {
                const targetName = (werewolfResponse as WerewolfActionZod).target;
                const targetablePlayers = this.getTargetablePlayers(true); // Exclude werewolves
                const targetableNames = targetablePlayers.map(p => p.name);

                if (!targetableNames.includes(targetName)) {
                    throw new BotResponseError(
                        `Invalid werewolf target: ${targetName}`,
                        `The target must be a living non-werewolf player. Available targets: ${targetableNames.join(', ')}`,
                        {
                            selectedTarget: targetName,
                            availableTargets: targetableNames,
                            werewolfName: werewolfBot.name
                        },
                        true
                    );
                }

                // Save the target to nightResults
                const currentNightResults = this.game.nightResults || {};
                currentNightResults[GAME_ROLES.WEREWOLF] = { target: targetName };

                gameUpdates.nightResults = currentNightResults;

                // Calculate intermediate resolvedNightState and save it
                gameUpdates.resolvedNightState = this.computeIntermediateNightState(currentNightResults, baseNightState);

                this.logNightAction(`✅ Werewolf target validated and saved: ${targetName}`);
            }

            // Create werewolf response message with WEREWOLVES recipient
            // Add thinking content and signature to the response object
            const msgWithThinking = isLastWerewolf
                ? { ...(werewolfResponse as WerewolfActionZod), thinking: thinking || "", ...getProviderSignatureFields(werewolfBot.aiType, thinkingSignature) }
                : { ...(werewolfResponse as any), thinking: thinking || "", ...getProviderSignatureFields(werewolfBot.aiType, thinkingSignature) };

            const werewolfMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_WEREWOLVES,
                authorName: werewolfBot.name,
                msg: msgWithThinking,
                messageType: isLastWerewolf ? MessageType.WEREWOLF_ACTION : MessageType.BOT_ANSWER,
                day: this.game.currentDay,
                timestamp: Date.now(),
                cost: tokenUsage?.costUSD
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(werewolfMessage, this.gameId);

            if (tokenUsage) {
                await recordBotTokenUsage(this.gameId, werewolfBot.name, tokenUsage, session.user.email);
            }

            // Check if this was the last werewolf in the queue
            if (remainingQueue.length === 0) {
                this.logNightAction("Werewolf phase completed");
            }

            if (isLastWerewolf) {
                this.logNightAction(`Werewolf ${werewolfBot.name} selected target: ${(werewolfResponse as WerewolfActionZod).target}`);
            } else {
                this.logNightAction(`Werewolf ${werewolfBot.name} contributed to discussion`);
            }

            return {
                success: true,
                gameUpdates: gameUpdates
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

// Register this processor
registerRoleProcessor(GAME_ROLES.WEREWOLF, WerewolfProcessor);
