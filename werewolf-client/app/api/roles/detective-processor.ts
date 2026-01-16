import {BaseRoleProcessor, NightActionResult, NightOutcome} from "./base-role-processor";
import {
    BotResponseError,
    GAME_MASTER,
    GAME_ROLES,
    GameMessage,
    MessageType,
    RECIPIENT_DETECTIVE,
    DetectiveInvestigation
} from "@/app/api/game-models";
import {AgentFactory} from "@/app/ai/agent-factory";
import {addMessageToChatAndSaveToDb, getBotMessages} from "@/app/api/game-actions";
import {getApiKeysForUser} from "@/app/utils/tier-utils";
import {auth} from "@/auth";
import {convertToAIMessages} from "@/app/utils/message-utils";
import {BOT_DETECTIVE_ACTION_PROMPT, BOT_SYSTEM_PROMPT} from "@/app/ai/prompts/bot-prompts";
import {format} from "@/app/ai/prompts/utils";
import {generateBotContextSection} from "@/app/utils/bot-utils";
import {DetectiveActionZodSchema} from "@/app/ai/prompts/zod-schemas";
import {recordBotTokenUsage} from "@/app/api/cost-tracking";

/**
 * Detective role processor
 * Handles detective night actions (investigation of players to learn their roles)
 */
export class DetectiveProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DETECTIVE);
    }

    async getNightResultsOutcome(nightResults: any, currentOutcome: NightOutcome): Promise<Partial<NightOutcome>> {
        const outcome: Partial<NightOutcome> = {};

        if (nightResults.detective) {
            outcome.detectiveWasActive = true;
            const detectiveTarget = nightResults.detective.target;

            // Check if detective target died
            outcome.detectiveTargetDied = currentOutcome.killedPlayer === detectiveTarget;

            // Get the investigated player's role to determine if evil was found
            let detectiveTargetRole: string;
            if (detectiveTarget === this.game.humanPlayerName) {
                detectiveTargetRole = this.game.humanPlayerRole;
            } else {
                const targetBot = this.game.bots.find(bot => bot.name === detectiveTarget);
                detectiveTargetRole = targetBot ? targetBot.role : 'unknown';
            }
            outcome.detectiveFoundEvil = detectiveTargetRole === GAME_ROLES.WEREWOLF;
        }

        return outcome;
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            const playersInfo = this.getPlayersWithRole();

            if (playersInfo.allPlayers.length === 0) {
                // No detectives alive, skip this action
                this.logNightAction("No detectives alive, skipping action");
                return { success: true };
            }

            // The gameStateParamQueue should already be populated by the generic night action logic
            if (this.game.gameStateParamQueue.length === 0) {
                this.logNightAction("No detectives in action queue, skipping");
                return { success: true };
            }

            // Get the current detective from the param queue
            const detectiveName = this.game.gameStateParamQueue[0];
            const remainingQueue = this.game.gameStateParamQueue.slice(1);

            this.logNightAction(`Detective (${detectiveName}) is taking their night action`);

            // Get the detective bot (skip if human player)
            const detectiveBot = playersInfo.bots.find(bot => bot.name === detectiveName);
            if (!detectiveBot) {
                // If human detective, skip for now (would need UI implementation)
                this.logNightAction(`HUMAN DETECTIVE DETECTED: Skipping auto-processing for human detective: ${detectiveName}`);
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

            // Create detective prompt
            const detectivePrompt = format(BOT_SYSTEM_PROMPT, {
                name: detectiveBot.name,
                personal_story: detectiveBot.story,
                play_style: "",
                role: detectiveBot.role,
                human_player_name: this.game.humanPlayerName,
                werewolf_teammates_section: '',
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== detectiveBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", "),
                bot_context: generateBotContextSection(detectiveBot, this.game)
            });

            // Create agent
            const agent = AgentFactory.createAgent(detectiveBot.name, detectivePrompt, detectiveBot.aiType, apiKeys, detectiveBot.enableThinking || false);

            // Get all living players except the detective for investigation
            const allLivePlayers = [
                ...this.game.bots.filter(bot => bot.isAlive && bot.name !== detectiveBot.name).map(bot => bot.name),
                this.game.humanPlayerName
            ];
            const targetNames = allLivePlayers.join(', ');

            const detectiveActionPrompt = `${format(BOT_DETECTIVE_ACTION_PROMPT, { bot_name: detectiveBot.name })}\n\n**Available targets:** ${targetNames}`;

            const gmMessage: GameMessage = {
                id: null,
                recipientName: detectiveBot.name,
                authorName: GAME_MASTER,
                msg: detectiveActionPrompt,
                messageType: MessageType.GM_COMMAND,
                day: this.game.currentDay,
                timestamp: Date.now()
            };

            // Get messages for this detective bot
            const botMessages = await getBotMessages(this.gameId, detectiveBot.name, this.game.currentDay);

            // Create conversation history
            const history = convertToAIMessages(detectiveBot.name, [...botMessages, gmMessage]);

            const [detectiveResponse, thinking, tokenUsage] = await agent.askWithZodSchema(DetectiveActionZodSchema, history);

            if (!detectiveResponse) {
                throw new Error(`Detective ${detectiveBot.name} failed to respond to investigation prompt`);
            }

            // Validate target - detective can investigate any living player except themselves
            if (!allLivePlayers.includes(detectiveResponse.target)) {
                throw new BotResponseError(
                    `Invalid detective target: ${detectiveResponse.target}`,
                    `The target must be a living player other than the detective. Available targets: ${allLivePlayers.join(', ')}`,
                    {
                        selectedTarget: detectiveResponse.target,
                        availableTargets: allLivePlayers,
                        detectiveName: detectiveBot.name
                    },
                    true
                );
            }

            // Get the target's role for investigation result
            let targetRole: string;
            if (detectiveResponse.target === this.game.humanPlayerName) {
                targetRole = this.game.humanPlayerRole;
            } else {
                const targetBot = this.game.bots.find(bot => bot.name === detectiveResponse.target);
                targetRole = targetBot ? targetBot.role : 'unknown';
            }

            // Save the target to nightResults
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.DETECTIVE] = { target: detectiveResponse.target };

            // Store investigation result in detective bot's roleKnowledge
            // Detective only learns if target is a werewolf, not their actual role
            const investigation: DetectiveInvestigation = {
                day: this.game.currentDay,
                target: detectiveResponse.target,
                isWerewolf: targetRole === GAME_ROLES.WEREWOLF
            };

            // Update the detective bot's roleKnowledge
            const updatedBots = this.game.bots.map(bot => {
                if (bot.name === detectiveBot.name) {
                    const existingInvestigations = bot.roleKnowledge?.investigations || [];
                    return {
                        ...bot,
                        roleKnowledge: {
                            ...bot.roleKnowledge,
                            investigations: [...existingInvestigations, investigation]
                        }
                    };
                }
                return bot;
            });

            // Create detective response message with investigation result (sent only to the detective)
            const investigationResult = {
                ...detectiveResponse,
                result: `Investigation reveals: ${detectiveResponse.target} is a ${targetRole.charAt(0).toUpperCase() + targetRole.slice(1)}`
            };

            const detectiveMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_DETECTIVE,
                authorName: detectiveBot.name,
                msg: investigationResult,
                messageType: MessageType.DETECTIVE_ACTION,
                day: this.game.currentDay,
                timestamp: Date.now(),
                cost: tokenUsage?.costUSD
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(detectiveMessage, this.gameId);

            if (tokenUsage) {
                await recordBotTokenUsage(this.gameId, detectiveBot.name, tokenUsage, session.user.email);
            }

            this.logNightAction(`✅ Detective ${detectiveBot.name} investigated: ${detectiveResponse.target} (${targetRole})`);

            return {
                success: true,
                gameUpdates: {
                    nightResults: currentNightResults,
                    gameStateParamQueue: remainingQueue,
                    bots: updatedBots
                }
            };

        } catch (error) {
            console.error('Error in DetectiveProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in detective action'
            };
        }
    }
}
