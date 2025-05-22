Help me to refactor the talkToAll logic

This function covers two cases:
1. When the human player asks something, and the list of bot who should reply is not yet defined by the Game Master. In this case, we should 
    - load the messages from the database for the current day, addressed to everybody
    - Ask the Game Master agent to pick from 1 to 3 bots to respond to the human player taking into account the daily discussion (the messages we loaded)
    - One the Game Master Agent return a list of names, this list if returned to the client
2. When there is no human player message but the gameStateProcessQueue is not empty (it has one or more bot player names in it). In this case, we should
    - Take the first name from the gameStateProcessQueue
    - Load all the messages from the current day addressed to everybody or to this bot
    - Ask the bot to reply. It should be a GAme MAster command message similarly how bots are being asked to introduce themselves in the welcome function
    - Save the bot's reply to the database
    - Update the gameStateProcessQueue, because now it has 1 name less