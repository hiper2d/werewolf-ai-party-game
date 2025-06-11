# Werewold Night Action Phase

Okay, we are ready to implement the first night action. After the VOTE phase is completed, the game should be in the NIGHT_BEGINS state. The startNight function currently does nothing. Let's add some functionality.

1. First of all, we should create a config for game roles and their night actions. Who goes after who. Currently roles are defined in game-modes.ts as constants and there are some difinitions of them in bot-prompts.ts. Let's change that. We should have a config with all the special roles in order of them night actions, with the exception for villager as it's a passive role withough any actions at night. Thera are three special roles for now: werewolf, doctor, detective. Each role in the role config should include the following fields:
- name
- instruction
- gm_command
The name is clear. The instruction is for the role owner player to explain what they can do. Roles instructions will be included to bot's prompts and to the game rules on UI later. The gm_command is the command the Game Master will tell to the model when it's time for the night action. Having this role config, we can read it and use when creating the game, constructing instructions to bots, and when performing the night actions.

2. Let's rename the startNight function into the nightAction, and the NIGHT_BEGINS actin name into the NIGHT_ACTION. The nightAction function would work in the following way:
- When it is being called for the first time (from the VOTE_RESULTS state), we clean the game's gameStateParamQueue and gameStateProcessQueue. Then we look for the first role in the role config and populate the gameStateProcessQueue with role names in order. Then return.
- When the game state is the NIGHT_ACTION, we read the first role name in the gameStateProcessQueue. Now we need to process this role. Let's create the RoleActionProcessor abstract class and implementations for each role with one method - process. The method return true is the action is completed, and false if the action of the current role is not final. It also accepts the game object. The nightAction should calls the process on the correct implementation. If it returns true, then the first role name from the gameStateProcessQueue is removed, the game is saved, and the nightAction returns. In case, the process returns false, the nightAction returns without updating the game in the database.
- When the game state is the NIGHT_ACTION and gameStateProcessQueue is empty, then we update the game state to the NIGHT_RESULTS and return.

Let's implement this first before we proceed with the implementations for the RoleActionProcessor.

The @/werewolf-client/app/games/[id]/GamePage.tsx  should check the first role in the gameStateProcessQueue and show that this player is making a move. The same way as we show other actions in progress like "Starting Night..."

# Referenced files

@/werewolf-client/app/api/night-actions.ts@/werewolf-client/app/ai/prompts/bot-prompts.ts@/werewolf-client/app/api/game-models.ts