The problem is that next.js has some refresh loop, and we have to persist the error state. Let's create a field in the
game object with the error message. We should intercept the backend calls and catch all errors. In case of an error, we
should update the game object and then return the execution to the frontend. The frontend should display the error
message in the error banner and don't send any requests to the backend. It should not process the current game state.
The refresh button should reset the error state which should trigger the normal game state processing on UI.

==========

Let's implement the werewolves Night action. We already have the WerewolfProcessor in place with no logic. Let me
describe the desired logic.

Let's start from the frontend first. When the frontend sees that the current state is the NIGHT (and there is no error
in the game object), it should check what role is the first one in the gameStateProcessQueue. The UI should show that
this role is currently taking an action (in the disabled input where other statues are shown). Then UI makes the server
call of the performNightAction function. We will have to add additional logic in case of the human player is the current
role owner, but later. For now let's just skipp it. If the gameStateProcessQueue is empty while the game state is NIGHT,
we should call the endNight function.

Now let me describe the backend logic:

1. The processor should the check if the gameStateParamQueue empty or not. When the werewolf night phase starts, it
   expected to be empty
2. When the gameStateParamQueue is empty, the processor should populate it. If there is only one werewolf remains alive,
   then we save it as a one item array into the gameStateParamQueue. When there are more werewolves in the play, we
   create a randomized array with them and then append it to itself so each name presents twice in the array. We save
   this array to the gameStateParamQueue.
3. If the gameStateParamQueue is not empty, then the processor should pick the first name. If this is the human player
   name, let's just skip it and do nothing for now. If it's a bot name, then we should create an agent and make the LLM
   API call. We should ask this bot to participate the werewolves night discussion. Werewolves need to share their
   observations and suggest the victim for the night action kill. They should also discuss plans for the next day. In
   case, it's the last (or the only) werewolf in the gameStateParamQueue, the prompt should force this bot to make the
   conclusion and pick the victim. The victim must be an alive player. It should not be a werewolf unless killing a
   werewolf is a part of the strategy. After receiving the reply, it should added to the database with the WEREWOLVES as
   the recipientName. When the message history is prepared for a werewolf bot, all the WEREWOLVES recipient messages
   should be also selected. In the human player is a werewolf, they are allowed to see those messages as well. After the
   message is saved to DB, we remove it from the gameStateParamQueue and save the game object.
