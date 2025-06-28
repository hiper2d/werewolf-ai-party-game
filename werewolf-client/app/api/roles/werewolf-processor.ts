import { BaseRoleProcessor, NightActionResult } from "./base-role-processor";
import { GAME_ROLES } from "@/app/api/game-models";

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

            // todo

            /* if the game.gameStateParamQueue is empty, then do the following
                1. create a list of werewolf names in a random order
                2. there are more than one werewolves alive, append the list to itself, so each name present twice in the final list
                3. save the result list to the game.gameStateParamQueue
                4. end the execution of the processor

                If the game.gameStateParamQueue is not empty, then do this:
                1. pick the first name from the queue
                2. create a bot agents and ask it to select a victim the werewolves want to kill this night
                3. save the response to the database with the new recipient type WEREWOLVES
                4. remove the name from the queue and save it
                5. end the execution of the processor

                When removing the last name from the game.gameStateParamQueue, updates the gameStateProcessQueue by removing the current role ('werewolf') from it as well.
                This means that the werewolves phase is completed. Later we'll handle the werewolves phase results later.

                Update the frontend logic in the GameChat so it handles the GAME_STATES.NIGHT:
                1. It should check what is the first role in the game.gameStateProcessQueue and show that this role is taking action in the getInputPlaceholder
                2. Then it should make a server function call to the processNightQueue
            */

            // Send a message indicating werewolves are active
            await this.sendMessage(`🐺 The werewolves stir in the darkness, planning their next move...`);

            return {
                success: true,
                messages: []
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