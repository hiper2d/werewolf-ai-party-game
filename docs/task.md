Let's implement a first phase of the game night. Currently, we have the NIGHT_BEGINS       │
│   state where we populate the gameStateProcessQueue game's parameter with the sortet list    │
│   of roles. Those players will take actions during the night. Let's rename the state from    │
│   NIGHT_BEGINS to the NIGHT, and the startNight function into the performNightAction. I      │
│   want to extend it's existing logic to the following. Kee the current logic in case when    │
│   the game state is VOTE_RESULTS. If the game state is the NIGHT already then we need to     │
│   check if the gameStateProcessQueue field is empty of not. If it is not empty, we need to   │
│   read the first value value (a role) from it, find a player and just output to the log      │
│   that the player with the certain role it taking a night action. We'll implelemnt the       │
│   actions later. In case of the werevolves, we should output all of them to the log. Then,   │
│   remove the value we read from the gameStateProcessQueue and save the game. In the          │
│   gameStateProcessQueue is empty, and the game state if the NIGHT, this means we are done,   │
│   and it's time to finish the night by changing the game state to the NIGHT_ENDS state. UI   │
│   should check is the game state is the NIGHT, it should call the performNightAction.        │
│   function. It should also disable the input and the buttons showing that a certain role     │
│   take an action at the moment.  