import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES, GAME_MASTER, GameMessage, MessageType, BotResponseError } from "@/app/api/game-models";
import { AgentFactory } from "@/app/ai/agent-factory";
import { addMessageToChatAndSaveToDb, getBotMessages, getUserFromFirestore } from "@/app/api/game-actions";
import { getUserApiKeys } from "@/app/api/user-actions";
import { generatePlayStyleDescription } from "@/app/utils/bot-utils";
import { auth } from "@/auth";
import { convertToAIMessages, parseResponseToObj } from "@/app/utils/message-utils";
import { BOT_SYSTEM_PROMPT, BOT_DOCTOR_ACTION_PROMPT } from "@/app/ai/prompts/bot-prompts";
import { format } from "@/app/ai/prompts/utils";
import { createDoctorActionSchema, DoctorAction } from "@/app/ai/prompts/ai-schemas";

/**
 * Doctor role processor
 * Handles doctor night actions (protection of players from elimination)
 */
export class DoctorProcessor extends BaseRoleProcessor {
    constructor(gameId: string, game: any) {
        super(gameId, game, GAME_ROLES.DOCTOR);
    }

    async processNightAction(): Promise<NightActionResult> {
        try {
            // First, announce that it's the doctor's turn
            await this.announceRoleTurn();

            const playersInfo = this.getPlayersWithRole();
            
            if (playersInfo.allPlayers.length === 0) {
                // No doctors alive, skip this action
                this.logNightAction("No doctors alive, skipping action");
                return { success: true };
            }

            // For individual roles like doctor, typically only one player
            const doctorPlayer = playersInfo.allPlayers[0];
            
            // Check if the doctor is alive
            if (!doctorPlayer.isAlive) {
                this.logNightAction(`Doctor ${doctorPlayer.name} is dead, skipping action`);
                return { success: true };
            }
            
            const doctorName = doctorPlayer.name;
            this.logNightAction(`Doctor (${doctorName}) is taking their night action`);

            // Get the doctor bot (skip if human player)
            const doctorBot = playersInfo.bots.find(bot => bot.name === doctorName);
            if (!doctorBot) {
                // If human doctor, skip for now (would need UI implementation)
                this.logNightAction(`Skipping human doctor: ${doctorName}`);
                return { success: true };
            }

            // Get authentication for API calls
            const session = await auth();
            if (!session || !session.user?.email) {
                throw new Error('Not authenticated');
            }

            // Get API keys
            const user = await getUserFromFirestore(session.user.email);
            const apiKeys = await getUserApiKeys(user!.email);

            // Create doctor prompt
            const doctorPrompt = format(BOT_SYSTEM_PROMPT, {
                name: doctorBot.name,
                personal_story: doctorBot.story,
                play_style: generatePlayStyleDescription(doctorBot),
                role: doctorBot.role,
                players_names: [
                    ...this.game.bots
                        .filter(b => b.name !== doctorBot.name)
                        .map(b => b.name),
                    this.game.humanPlayerName
                ].join(", "),
                dead_players_names_with_roles: this.game.bots
                    .filter(b => !b.isAlive)
                    .map(b => `${b.name} (${b.role})`)
                    .join(", ")
            });

            // Create agent
            const agent = AgentFactory.createAgent(doctorBot.name, doctorPrompt, doctorBot.aiType, apiKeys);

            // Get all living players for protection
            const allLivePlayers = [
                ...this.game.bots.filter(bot => bot.isAlive).map(bot => bot.name),
                this.game.humanPlayerName
            ];
            const targetNames = allLivePlayers.join(', ');

            const doctorActionPrompt = `${BOT_DOCTOR_ACTION_PROMPT}\n\n**Available targets:** ${targetNames}`;

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

            const schema = createDoctorActionSchema();
            const rawResponse = await agent.askWithSchema(schema, history);

            if (!rawResponse) {
                throw new Error(`Doctor ${doctorBot.name} failed to respond to protection prompt`);
            }

            const doctorResponse = parseResponseToObj(rawResponse, 'DoctorAction') as DoctorAction;

            // Validate target - doctor can protect any living player
            if (!allLivePlayers.includes(doctorResponse.target)) {
                throw new BotResponseError(
                    `Invalid doctor target: ${doctorResponse.target}`,
                    `The target must be a living player. Available targets: ${allLivePlayers.join(', ')}`,
                    {
                        selectedTarget: doctorResponse.target,
                        availableTargets: allLivePlayers,
                        doctorName: doctorBot.name
                    },
                    true
                );
            }

            // Save the target to nightResults
            const currentNightResults = this.game.nightResults || {};
            currentNightResults[GAME_ROLES.DOCTOR] = { target: doctorResponse.target };

            // Create doctor response message (sent only to the doctor)
            const doctorMessage: GameMessage = {
                id: null,
                recipientName: doctorBot.name,
                authorName: doctorBot.name,
                msg: doctorResponse,
                messageType: MessageType.DOCTOR_ACTION,
                day: this.game.currentDay,
                timestamp: Date.now()
            };

            // Save messages
            await addMessageToChatAndSaveToDb(gmMessage, this.gameId);
            await addMessageToChatAndSaveToDb(doctorMessage, this.gameId);

            this.logNightAction(`✅ Doctor ${doctorBot.name} protected: ${doctorResponse.target}`);

            return {
                success: true,
                gameUpdates: {
                    nightResults: currentNightResults
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