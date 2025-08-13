import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES, GAME_MASTER, GameMessage, MessageType, BotResponseError, RECIPIENT_DETECTIVE } from "@/app/api/game-models";
import { AgentFactory } from "@/app/ai/agent-factory";
import { addMessageToChatAndSaveToDb, getBotMessages, getUserFromFirestore } from "@/app/api/game-actions";
import { getUserApiKeys } from "@/app/api/user-actions";
import { auth } from "@/auth";
import { convertToAIMessages, parseResponseToObj } from "@/app/utils/message-utils";
import { BOT_SYSTEM_PROMPT, BOT_DETECTIVE_ACTION_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { createDetectiveActionSchema, DetectiveAction } from "@/app/ai/prompts/ai-schemas";

/**
 * Detective role processor
 * Handles detective night actions (investigation of players to learn their roles)
 */
export class DetectiveProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DETECTIVE);
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
            const user = await getUserFromFirestore(session.user.email);
            const apiKeys = await getUserApiKeys(user!.email);

            // Create detective prompt
            const detectivePrompt = format(BOT_SYSTEM_PROMPT, {
                name: detectiveBot.name,
                personal_story: detectiveBot.story,
                play_style: "",
                role: detectiveBot.role,
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
                    .join(", ")
            });

            // Create agent
            const agent = AgentFactory.createAgent(detectiveBot.name, detectivePrompt, detectiveBot.aiType, apiKeys);

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

            const schema = createDetectiveActionSchema();
            const rawResponse = await agent.askWithSchema(schema, history);

            if (!rawResponse) {
                throw new Error(`Detective ${detectiveBot.name} failed to respond to investigation prompt`);
            }

            const detectiveResponse = parseResponseToObj(rawResponse, 'DetectiveAction') as DetectiveAction;

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
                timestamp: Date.now()
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(detectiveMessage, this.gameId);

            this.logNightAction(`✅ Detective ${detectiveBot.name} investigated: ${detectiveResponse.target} (${targetRole})`);

            return {
                success: true,
                gameUpdates: {
                    nightResults: currentNightResults,
                    gameStateParamQueue: remainingQueue
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