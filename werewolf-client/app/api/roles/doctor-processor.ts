import { BaseRoleProcessor, NightActionResult, NightOutcome } from "./base-role-processor";
import { GAME_ROLES, GAME_MASTER, GameMessage, MessageType, BotResponseError, RECIPIENT_DOCTOR } from "@/app/api/game-models";
import { AgentFactory } from "@/app/ai/agent-factory";
import { addMessageToChatAndSaveToDb, getBotMessages, getUserFromFirestore } from "@/app/api/game-actions";
import { getApiKeysForUser } from "@/app/utils/tier-utils";
import { auth } from "@/auth";
import { convertToAIMessages } from "@/app/utils/message-utils";
import { BOT_SYSTEM_PROMPT, BOT_DOCTOR_ACTION_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { generateBotContextSection } from "@/app/utils/bot-utils";
import { DoctorActionZodSchema } from "@/app/ai/prompts/zod-schemas";
import { DoctorAction } from "@/app/ai/prompts/ai-schemas";
import { recordBotTokenUsage } from "@/app/api/cost-tracking";

/**
 * Doctor role processor
 * Handles doctor night actions (protection of players from elimination)
 */
export class DoctorProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DOCTOR);
    }

    async getNightResultsOutcome(nightResults: any, currentOutcome: NightOutcome): Promise<Partial<NightOutcome>> {
        return {
            doctorWasActive: !!nightResults.doctor
        };
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            const playersInfo = this.getPlayersWithRole();

            if (playersInfo.allPlayers.length === 0) {
                // No doctors alive, skip this action
                this.logNightAction("No doctors alive, skipping action");
                return { success: true };
            }

            // The gameStateParamQueue should already be populated by the generic night action logic
            if (this.game.gameStateParamQueue.length === 0) {
                this.logNightAction("No doctors in action queue, skipping");
                return { success: true };
            }

            // Get the current doctor from the param queue
            const doctorName = this.game.gameStateParamQueue[0];
            const remainingQueue = this.game.gameStateParamQueue.slice(1);

            this.logNightAction(`Doctor (${doctorName}) is taking their night action`);

            // Get the doctor bot (skip if human player)
            const doctorBot = playersInfo.bots.find(bot => bot.name === doctorName);
            if (!doctorBot) {
                // If human doctor, skip for now (would need UI implementation)
                this.logNightAction(`HUMAN DOCTOR DETECTED: Skipping auto-processing for human doctor: ${doctorName}`);
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

            // Create doctor prompt
            const doctorPrompt = format(BOT_SYSTEM_PROMPT, {
                name: doctorBot.name,
                personal_story: doctorBot.story,
                play_style: "",
                role: doctorBot.role,
                human_player_name: this.game.humanPlayerName,
                werewolf_teammates_section: '',
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== doctorBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", "),
                bot_context: generateBotContextSection(doctorBot, this.game)
            });

            // Create agent
            const agent = AgentFactory.createAgent(doctorBot.name, doctorPrompt, doctorBot.aiType, apiKeys, doctorBot.enableThinking || false);

            // Get all living players for protection
            const allLivePlayers = [
                ...this.game.bots.filter(bot => bot.isAlive).map(bot => bot.name),
                this.game.humanPlayerName
            ];

            // Check who was protected last night (cannot protect same target twice in a row)
            const previousProtectedTarget = this.game.previousNightResults?.doctor?.target || null;

            // Filter out the previous target if it exists
            const availableTargets = previousProtectedTarget
                ? allLivePlayers.filter(player => player !== previousProtectedTarget)
                : allLivePlayers;

            const targetNames = availableTargets.join(', ');

            // Create prompt with previous target restriction info
            let doctorActionPrompt = format(BOT_DOCTOR_ACTION_PROMPT, { bot_name: doctorBot.name });

            if (previousProtectedTarget) {
                doctorActionPrompt += `\n\n**IMPORTANT RESTRICTION:** You protected **${previousProtectedTarget}** last night. You CANNOT protect the same player two nights in a row, so ${previousProtectedTarget} is NOT available as a target tonight.`;
            }

            doctorActionPrompt += `\n\n**Available targets for protection:** ${targetNames}`;

            const gmMessage: GameMessage = {
                id: null,
                recipientName: doctorBot.name,
                authorName: GAME_MASTER,
                msg: doctorActionPrompt,
                messageType: MessageType.GM_COMMAND,
                day: this.game.currentDay,
                timestamp: Date.now()
            };

            // Get messages for this doctor bot
            const botMessages = await getBotMessages(this.gameId, doctorBot.name, this.game.currentDay);

            // Create conversation history
            const history = convertToAIMessages(doctorBot.name, [...botMessages, gmMessage]);

            const [doctorResponse, thinking, tokenUsage] = await agent.askWithZodSchema(DoctorActionZodSchema, history);

            if (!doctorResponse) {
                throw new Error(`Doctor ${doctorBot.name} failed to respond to protection prompt`);
            }

            // Validate target - must be a living player AND not the same as last night
            if (!availableTargets.includes(doctorResponse.target)) {
                if (doctorResponse.target === previousProtectedTarget) {
                    throw new BotResponseError(
                        `Doctor cannot protect same target twice in a row`,
                        `Doctor ${doctorBot.name} tried to protect ${doctorResponse.target} again, but they protected this player last night. Must choose a different target.`,
                        {
                            selectedTarget: doctorResponse.target,
                            previousTarget: previousProtectedTarget,
                            availableTargets: availableTargets,
                            doctorName: doctorBot.name
                        },
                        true
                    );
                } else if (!allLivePlayers.includes(doctorResponse.target)) {
                    throw new BotResponseError(
                        `Invalid doctor target: ${doctorResponse.target}`,
                        `The target must be a living player. Available targets: ${availableTargets.join(', ')}`,
                        {
                            selectedTarget: doctorResponse.target,
                            availableTargets: availableTargets,
                            doctorName: doctorBot.name
                        },
                        true
                    );
                } else {
                    // This shouldn't happen, but catch any other validation issues
                    throw new BotResponseError(
                        `Invalid doctor target: ${doctorResponse.target}`,
                        `The target is not available. Available targets: ${availableTargets.join(', ')}`,
                        {
                            selectedTarget: doctorResponse.target,
                            availableTargets: availableTargets,
                            previousTarget: previousProtectedTarget,
                            doctorName: doctorBot.name
                        },
                        true
                    );
                }
            }

            // Save the target to nightResults
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.DOCTOR] = { target: doctorResponse.target };

            // Create doctor response message (sent only to the doctor role)
            const doctorMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_DOCTOR,
                authorName: doctorBot.name,
                msg: doctorResponse,
                messageType: MessageType.DOCTOR_ACTION,
                day: this.game.currentDay,
                timestamp: Date.now(),
                cost: tokenUsage?.costUSD
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(doctorMessage, this.gameId);

            if (tokenUsage) {
                await recordBotTokenUsage(this.gameId, doctorBot.name, tokenUsage, session.user.email);
            }

            this.logNightAction(`✅ Doctor ${doctorBot.name} protected: ${doctorResponse.target}`);

            return {
                success: true,
                gameUpdates: {
                    nightResults: currentNightResults,
                    gameStateParamQueue: remainingQueue
                }
            };

        } catch (error) {
            console.error('Error in DoctorProcessor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in doctor action'
            };
        }
    }
}
