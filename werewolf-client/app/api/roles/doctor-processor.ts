import { BaseRoleProcessor, NightActionResult, NightState } from "./base-role-processor";
import { registerRoleProcessor } from "./role-processor-factory";
import { GAME_ROLES, GAME_MASTER, GameMessage, MessageType, BotResponseError, RECIPIENT_DOCTOR, ROLE_CONFIGS } from "@/app/api/game-models";
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
import { getProviderSignatureFields } from "@/app/ai/ai-models";

/**
 * Doctor role processor
 * Handles doctor night actions (protection of players from elimination)
 */
export class DoctorProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DOCTOR);
    }

    computeIntermediateNightState(nightResults: Record<string, any>, state: NightState): NightState {
        // No doctor action was recorded (doctor didn't act or was abducted — handled in processNightAction)
        if (!nightResults.doctor) return state;

        const doctorTarget = nightResults.doctor.target;
        const actionType = nightResults.doctor.actionType || 'protect';

        // If doctor's target was abducted, action fails
        if (state.abductedPlayer === doctorTarget) {
            this.logNightAction(`Doctor's ${actionType} on ${doctorTarget} failed - target was abducted by Maniac`);
            state.actionsPrevented.push({
                role: GAME_ROLES.DOCTOR,
                reason: 'abduction',
                player: null // Doctor's target was abducted so action had no effect
            });
            return state;
        }

        if (actionType === 'protect') {
            // Check if doctor's target is in deaths (from werewolf attack) and remove it
            const deathIndex = state.deaths.findIndex(
                d => d.player === doctorTarget && d.cause === 'werewolf_attack'
            );
            if (deathIndex !== -1) {
                state.deaths.splice(deathIndex, 1);
                state.actionsPrevented.push({
                    role: GAME_ROLES.WEREWOLF,
                    reason: 'doctor_save',
                    player: null // Pack action blocked by doctor
                });
                this.logNightAction(`Doctor saved ${doctorTarget} from werewolf attack`);
            }
        } else if (actionType === 'kill') {
            // Doctor's one-time kill ability
            const victimRole = this.resolvePlayerRole(doctorTarget);
            state.deaths.push({ player: doctorTarget, role: victimRole, cause: 'doctor_kill' });
            this.logNightAction(`Doctor used DOCTOR'S MISTAKE to kill ${doctorTarget}`);

            // If killed target is the maniac, their abducted victim also dies
            if (victimRole === GAME_ROLES.MANIAC && state.abductedPlayer) {
                const collateralRole = this.resolvePlayerRole(state.abductedPlayer);
                state.deaths.push({ player: state.abductedPlayer, role: collateralRole, cause: 'maniac_collateral' });
                this.logNightAction(`Maniac killed by doctor - abducted victim ${state.abductedPlayer} also dies`);
            }
        }
        return state;
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

            // Get base night state once and reuse
            const baseNightState = this.getBaseNightState();

            // Check if doctor is abducted by maniac — skip entirely (no AI call)
            if (baseNightState.abductedPlayer === doctorName) {
                this.logNightAction(`Doctor ${doctorName} was abducted by Maniac — skipping their action`);
                baseNightState.actionsPrevented.push({
                    role: GAME_ROLES.DOCTOR,
                    reason: 'abduction',
                    player: doctorName
                });
                return {
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: remainingQueue,
                        resolvedNightState: baseNightState
                    }
                };
            }

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

            // Check if Doctor's kill ability is available
            const killAbilityAvailable = !this.game.oneTimeAbilitiesUsed?.doctorKill;
            const roleConfig = ROLE_CONFIGS[GAME_ROLES.DOCTOR];

            // Create prompt with previous target restriction info
            let doctorActionPrompt = format(BOT_DOCTOR_ACTION_PROMPT, { bot_name: doctorBot.name });

            if (previousProtectedTarget) {
                doctorActionPrompt += `\n\n**IMPORTANT RESTRICTION:** You protected **${previousProtectedTarget}** last night. You CANNOT protect the same player two nights in a row, so ${previousProtectedTarget} is NOT available as a target tonight.`;
            }

            // Add kill ability info if available
            if (killAbilityAvailable && roleConfig.oneTimeAbilities?.kill) {
                doctorActionPrompt += roleConfig.oneTimeAbilities.kill.promptAddition;
            }

            doctorActionPrompt += `\n\n**Available targets for protection${killAbilityAvailable ? ' or kill' : ''}:** ${targetNames}`;

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

            const [doctorResponse, thinking, tokenUsage, thinkingSignature] = await agent.askWithZodSchema(DoctorActionZodSchema, history);

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

            // Determine action type (default to protect)
            const actionType = doctorResponse.action_type || 'protect';

            // Validate kill ability usage
            if (actionType === 'kill' && !killAbilityAvailable) {
                throw new BotResponseError(
                    `Doctor kill ability already used`,
                    `Doctor ${doctorBot.name} tried to use the kill ability, but it was already used earlier in the game.`,
                    {
                        actionType: actionType,
                        doctorName: doctorBot.name
                    },
                    true
                );
            }

            // Save the target to nightResults (include actionType for kill tracking)
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.DOCTOR] = {
                target: doctorResponse.target,
                actionType: actionType
            };

            // Create doctor response message (sent only to the doctor role)
            const doctorMessage: GameMessage = {
                id: null,
                recipientName: RECIPIENT_DOCTOR,
                authorName: doctorBot.name,
                msg: { ...doctorResponse, thinking: thinking || "", ...getProviderSignatureFields(doctorBot.aiType, thinkingSignature) },
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

            if (actionType === 'kill') {
                this.logNightAction(`✅ Doctor ${doctorBot.name} used DOCTOR'S MISTAKE on: ${doctorResponse.target}`);
            } else {
                this.logNightAction(`✅ Doctor ${doctorBot.name} protected: ${doctorResponse.target}`);
            }

            // Build game updates
            const gameUpdates: any = {
                nightResults: currentNightResults,
                gameStateParamQueue: remainingQueue
            };

            // If kill ability was used, mark it as used
            if (actionType === 'kill') {
                gameUpdates.oneTimeAbilitiesUsed = {
                    ...(this.game.oneTimeAbilitiesUsed || {}),
                    doctorKill: true
                };
            }

            // Calculate intermediate resolvedNightState and save it
            gameUpdates.resolvedNightState = this.computeIntermediateNightState(currentNightResults, baseNightState);

            return {
                success: true,
                gameUpdates
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

// Register this processor
registerRoleProcessor(GAME_ROLES.DOCTOR, DoctorProcessor);
