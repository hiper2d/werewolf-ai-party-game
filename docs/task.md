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

=============

We implemented werewolves and doctor night actions but one thing is missing. What if the human player has the werewolf
or doctor role? In this case, we should not use the "performNightAction" server function which is supposed to work with
bots only. Instead, we should make the @werewolf-client/app/games/[id]/components/GameChat.tsx component to see if there
is the NIGHT state, and there is the werewolf role is the first one in the gameStateProcessingQueue, and there is the
human player name on
the first place of the gameStateParamQueue, then the UI should show a popup for the human player to provide a message
and with a dropdown with possible targets (similar to the voting dialog). The dropdown should be enabled only when the
human player is the only name in the gameStateParamQueue. In case of the werewolves, it should conclude who will be the
target. Once the dialog window if populates, its makes the call of the new server function in the bot-actions called "
performNumanPlayerNightAction". It should save the message to the database with the appropriate type (WEREWOLF_ACTION or
a new DOCTOR_ACTION). Then should check in the beginning the right values in both queues and remove the first name/role,
similarly how we handle bots.

==============

We implemented werewolves and doctor night actions but one thing is missing. What if the human player has the werewolf
or doctor role? Let's implement the logic that handles human player's werewolf actions during the night. When The
@werewolf-client/app/games/[id]/components/GameChat.tsx component sees that it's the NIGHT phase and there is the
werewolf role is the first in the gameStateProcessingQueue, and it is the human player's name is the first one in the
gameStateParamQueue, then one of two things can happen:

1. If there are more than one names in the gameStateParamQueue, then the chat becomes active, and the human player can
   post a message to the chat. They basically talk to other werewolves
2. When the human player's name is the last and the only item in the gameStateParamQueue, then we should show a button
   the chat called "Choose the werewolves target". Clicking the button shows the dialog similar to the voting dialog. It
   should contain a dropdown with target names and an input to provide the last message to other werewolves this night.
   In both cases, after the message is posted of after the dialog's OK button it presses, the new "
   performNumanPlayerNightAction" in the @werewolf-client/app/api/bot-actions.ts must be called. It saves the message
   with the WEREWOLVES recipient and concludes the werewolves action phase if this is the last werewolf.

I think the dialog can be generic. Depending on the current role, it can show a message from the ROLE_CONFIGS in
@werewolf-client/app/api/game-models.ts.

====

The race condition problem: when the human player performs the doctor's night action, while the dialog window is being
shown, the game goes into the NIGHT_END state in parallel.
We failed to find the root cause multiple times. Instead, I'd like to revising the whole night logic.

Night init logic:
When the night starts, we put all roles, who are going to do actions, in the gameStateProcessQueue. We call
gameStateProcessQueue[0] the active role. We also populate the gameStateParamQueue with names of the players with the
active role. In case of werewolves it's a list of multiple names, for the doctor and the detective it's just one name.
We call the gameStateParamQueue[0] the active player. IT can be a bot name or the human player name.
The last steps is the move the game state from the NIGHT_BEGINS to the NIGHT. Let's then pass the execution back to the
frontend. The GameChat component checks the game's state, the active role, and the active player and decides what to do:

- to call the performNightAction server function
- or to let the human player to do something on UI (type to the chat or submit a message and a target name in the dialog
  window). We should never do both.

Night actions logic:
The frontend should check in the current game state is the NIGHT. If so, it should check what is the current role and
who is the current player.
Let's review all options:

1. The current role is 'werewolf', the current player is a bot. The frontend should call the performNightAction server
   function. The new logic assumes that when the function is being called, the gameStateParamQueue is populated with at
   least one name. The function acts slightly differently when there is only one name in the gameStateParamQueue versus
   many:
   1.1. There are more than one name in the gameStateParamQueue. This means that werewolves are still discussing their
   action and not ready to pick the target. The current player bot is being asked to participate the werewolves'
   discussion. After the successful reply, the bots message is saved to the database, the active player name is removed
   from the gameStateParamQueue
   1.2. The active bot player is the last in the gameStateParamQueue. This means that this werewolf concludes the
   werewolves action phase. It provides the message and the target. The message and the werewolves action is saved to
   the database, the active player name is removed from the gameStateParamQueue leaving it empty. In this case, we know
   that the current role finished its action, we should remove it from the gameStateProcessQueue and we should
   reinitialize the gameStateParamQueue with the new list of names for the next role. If this was the last role in the
   gameStateProcessQueue, we should moe the game state to the NIGHT_ENDS.
2. The current player is 'werewolf' and it's the human player. In this case, we don't call any server functions. There
   are two possible scenarios:
   2.1. The active player is not the last in the gameStateParamQueue. In this case, the human player should be able to
   reply to the game chat. Normally, we call the talkToAll server function for that. But in this case, let's create a
   new server function called humanPlayerTalkWerewolves in the night-actions. This function saved the message with the
   WEREWOLVES recipient name. When the message is saved to DB, we remove the active name from the gameStateParamQueue
   and return the execution back to the frontend.
   2.2. The active player is the last in the gameStateParamQueue. In this case, the frontend don't make any calls to the
   backend, it shows the dialog window for the human player asking to finalize the werewolves night action. When
   submitted, the performHumanPlayerNightAction server function should be called. It saves the message and the
   werewolves night action results to the database, removes the name from the gameStateParamQueue. Since this was the
   last name in it, it's time to remove the active role from the gameStateProcessQueue and either go to the next role or
   move the night to the NIGHT_ENDS state. The logic is exactly the same as in the 1.2.

Let's implement this. The summary of the idea:

- The gameStateParamQueue is always initialized when the performNightAction, humanPlayerTalkWerewolves,
  performHumanPlayerNightAction functions are being called
- If the gameStateParamQueue is empty, this means that the current role finishes its actions, and it's time to move to the next role
- When the active role finishes its actions, we move to the next role and reinitialize gameStateParamQueue
- There is no parallel processing on the frontend and on the backend. We either call a server function or wait for a user to provide some data on UI

======

Rewrite play styles:
- Aggressive provoker: boldly attack, falsely accuse, provoke to see the reaction 
- Protective team player: seek for alliances, suspicious about other alliances, protect bullied  
- Trickster: create chaos and change sides