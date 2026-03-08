import {BaseRoleProcessor, NightActionResult, NightState} from "./base-role-processor";
import {registerRoleProcessor} from "./role-processor-factory";
import {
    BotResponseError,
    GAME_MASTER,
    GAME_ROLES,
    GameMessage,
    MessageType,
    RECIPIENT_DETECTIVE
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
import {getProviderSignatureFields} from "@/app/ai/ai-models";

/**
 * Detective role processor
 * Handles detective night actions (investigation of players to learn their roles)
 */
export class DetectiveProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DETECTIVE);
    }

    /**
     * Determines whether a role reads as "evil" to the detective.
     * Werewolves are evil. Maniac also reads as evil to add ambiguity
     * to detective results — the detective can't be 100% sure an "evil"
     * result means werewolf.
     */
    private readsAsEvil(role: string): boolean {
        return role === GAME_ROLES.WEREWOLF || role === GAME_ROLES.MANIAC;
    }

    computeIntermediateNightState(nightResults: Record<string, any>, state: NightState): NightState {
        // No detective action was recorded (detective didn't act or was abducted/dead — handled in processNightAction)
        if (!nightResults.detective) return state;

        const detectiveTarget = nightResults.detective.target;
        const actionType = nightResults.detective.actionType || 'investigate';

        // If detective's target was abducted, action fails
        if (state.abductedPlayer === detectiveTarget) {
            this.logNightAction(`Detective ${actionType} of ${detectiveTarget} failed - target was abducted by Maniac`);
            state.actionsPrevented.push({
                role: GAME_ROLES.DETECTIVE,
                reason: 'abduction',
                player: null
            });
            return state;
        }

        if (actionType === 'kill') {
            // Detective's one-time kill ability
            const victimRole = this.resolvePlayerRole(detectiveTarget);
            state.deaths.push({ player: detectiveTarget, role: victimRole, cause: 'detective_kill' });
            this.logNightAction(`Detective used one-time kill on ${detectiveTarget} (${victimRole})`);

            // If killed target is the maniac, their abducted victim also dies
            if (victimRole === GAME_ROLES.MANIAC && state.abductedPlayer) {
                const collateralRole = this.resolvePlayerRole(state.abductedPlayer);
                state.deaths.push({ player: state.abductedPlayer, role: collateralRole, cause: 'maniac_collateral' });
                this.logNightAction(`Maniac killed by detective - abducted victim ${state.abductedPlayer} also dies`);
            }

            // Still set detectiveResult so the system knows detective acted (but no investigation result)
            state.detectiveResult = {
                target: detectiveTarget,
                isEvil: this.readsAsEvil(victimRole),
                success: true
            };
        } else {
            // Normal investigation
            const targetRole = this.resolvePlayerRole(detectiveTarget);
            state.detectiveResult = {
                target: detectiveTarget,
                isEvil: this.readsAsEvil(targetRole),
                success: true
            };
        }
        return state;
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

            // Get base night state once and reuse
            const baseNightState = this.getBaseNightState();

            // Check if detective is abducted by maniac — skip entirely (no AI call)
            if (baseNightState.abductedPlayer === detectiveName) {
                this.logNightAction(`Detective ${detectiveName} was abducted by Maniac — skipping their action`);
                baseNightState.actionsPrevented.push({
                    role: GAME_ROLES.DETECTIVE,
                    reason: 'abduction',
                    player: detectiveName
                });
                return {
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: remainingQueue,
                        resolvedNightState: baseNightState
                    }
                };
            }

            // Check if detective will die tonight (e.g. werewolf attack) — skip entirely (no AI call)
            if (baseNightState.deaths.some(d => d.player === detectiveName)) {
                this.logNightAction(`Detective ${detectiveName} will die tonight — skipping their action`);
                baseNightState.actionsPrevented.push({
                    role: GAME_ROLES.DETECTIVE,
                    reason: 'death',
                    player: detectiveName
                });
                return {
                    success: true,
                    gameUpdates: {
                        gameStateParamQueue: remainingQueue,
                        resolvedNightState: baseNightState
                    }
                };
            }

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
            agent.gameId = this.gameId;
            agent.userId = session.user.email;

            // Check kill ability availability
            const killAbilityAvailable = !this.game.oneTimeAbilitiesUsed?.detectiveKill;

            // Get all living players except the detective for investigation
            const allLivePlayers = [
                ...this.game.bots.filter(bot => bot.isAlive && bot.name !== detectiveBot.name).map(bot => bot.name),
                this.game.humanPlayerName
            ];
            const targetNames = allLivePlayers.join(', ');

            let detectiveActionPrompt = `${format(BOT_DETECTIVE_ACTION_PROMPT, { bot_name: detectiveBot.name })}\n\n**Available targets:** ${targetNames}`;
            if (!killAbilityAvailable) {
                detectiveActionPrompt += `\n\n⚠️ **Your one-time kill ability has already been used.** You can only investigate tonight.`;
            }

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

            const [detectiveResponse, thinking, tokenUsage, thinkingSignature] = await agent.askWithZodSchema(DetectiveActionZodSchema, history);

            if (!detectiveResponse) {
                throw new Error(`Detective ${detectiveBot.name} failed to respond to investigation prompt`);
            }

            // Validate target - detective can target any living player except themselves
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

            // Determine action type (default to investigate)
            const actionType = detectiveResponse.action_type || 'investigate';

            // Validate kill ability usage
            if (actionType === 'kill' && !killAbilityAvailable) {
                throw new BotResponseError(
                    `Detective ${detectiveBot.name} tried to use kill ability but it's already been used`,
                    `Your one-time kill ability has already been used. You can only investigate.`,
                    { detectiveName: detectiveBot.name, actionType },
                    true
                );
            }

            // Save the target and action type to nightResults
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.DETECTIVE] = { target: detectiveResponse.target, actionType };

            // Calculate intermediate resolvedNightState to get the result
            const intermediateNightState = this.computeIntermediateNightState(currentNightResults, baseNightState);
            const detectiveResult = intermediateNightState.detectiveResult!;

            // Create detective response message based on action type
            let resultMessage: string;
            if (actionType === 'kill') {
                resultMessage = `🗡️ You used your one-time kill ability on **${detectiveResponse.target}**. They will not survive the night.`;
            } else {
                resultMessage = !detectiveResult.success
                    ? `Investigation FAILED: ${detectiveResponse.target} could not be found tonight (they were abducted by the Maniac)`
                    : `Investigation reveals: ${detectiveResponse.target} appears to be ${detectiveResult.isEvil ? '**evil**' : '**innocent**'}`;
            }

            const investigationResult = {
                ...detectiveResponse,
                result: resultMessage,
                thinking: thinking || "",
                ...getProviderSignatureFields(detectiveBot.aiType, thinkingSignature)
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
            const savedGmMessage = await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            const savedDetectiveMessage = await addMessageToChatAndSaveToDb(detectiveMessage, this.gameId);

            if (tokenUsage) {
                await recordBotTokenUsage(this.gameId, detectiveBot.name, tokenUsage, session.user.email);
            }

            const targetRole = this.resolvePlayerRole(detectiveResponse.target);
            if (actionType === 'kill') {
                this.logNightAction(`✅ Detective ${detectiveBot.name} used ONE-TIME KILL on: ${detectiveResponse.target} (${targetRole})`);
            } else {
                this.logNightAction(`✅ Detective ${detectiveBot.name} investigated: ${detectiveResponse.target} (${targetRole})`);
            }

            // Build game updates — mark kill ability as used if applicable
            const gameUpdates: Partial<any> = {
                nightResults: currentNightResults,
                gameStateParamQueue: remainingQueue,
                resolvedNightState: intermediateNightState
            };

            if (actionType === 'kill') {
                gameUpdates.oneTimeAbilitiesUsed = {
                    ...this.game.oneTimeAbilitiesUsed,
                    detectiveKill: true
                };
            }

            return {
                success: true,
                gameUpdates,
                messages: [savedGmMessage, savedDetectiveMessage]
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

// Register this processor
registerRoleProcessor(GAME_ROLES.DETECTIVE, DetectiveProcessor);
