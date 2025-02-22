I want you yo work on `talkToAll` function of the bot-actions.ts file.

The desired logic is the following:
- When the functino is called (by the frontend), first of all load the game and make sure that the gameState is DAY_DISCUSSION
- Then check if there `gameStateProcessQueue` game's field is empty or not
- In case it's empty:
    - Save the user's message to the database
    - Get all the mesages for the day and ask the GM model to decide on which bots should reply: it should return a JSON array with 1-3 bot names
    - Finish the execution
- In case the `gameStateProcessQueue` is not empty:
    - Poll the first name
    - Ask this bot to reply. The bot should get all chat messages addressed to ALL and to itself. Then it should use the message-utils.ts to form a proper model history
    - Save the `gameStateProcessQueue`, so it has one name less now, and finish the execution

UI logic should change as well:
- When the chat is opened, load the game as it is now
- In case, the gameState is DAY_DISCUSSION, check if there `gameStateProcessQueue` game's field is empty or not
- In case it's empty:
    - Do nothing, it's time to the human player do type or do something
- In case the `gameStateProcessQueue` is not empty:
    - Disable Send button and the input for the user
    - Call the `talkToAll` backend function with empty user message
