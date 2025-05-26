I need to implement the voting functionality.

Voting is a new game phase which goes after the DAY DISCUSSION, when the human player hits the Voting button.
The voting button should be in the left bottom corner of the game instead of Start and Pause.
When the voting button is pressed, a backend calls of the new "vote" function is made.

The voting function has two modes (similar to the talkToAll):
1. When the game state is DAY_DISCUSSION, then 
   - clean the gameStateProcessQueue and gameStateParamQueue arrays, 
   - set the new game state "VOTE"
   - Take all alive bot players, add the human player name, shuffle the result list and save into the gameStateProcessQueue
   - save the game, return the API call
2. When the game state is VOTE, then
   - Check if there are names in the gameStateProcessQueue. If not, then update the game state to the VOTE_RESULTS, and return the API call
   - Pop the first name from the gameStateProcessQueue (it should be removed from the array)
   - Ask the selected bot to vote. They must choose another alive player name who should leave the game and why. The answer should be in the JSON format with two fields: "who", "why"
   - Update voting results map in the gameStateParamQueue field. This map should contain names and the vote counts for them
   - Save the result object to the database and save the game

UI behavior:
- Similarly to the Welcome state, the Game page on the UI should detect if the the state is VOTE and perform an action: send the API call to the vote function
- When a bot votes, it added a message in a certain format to the database. This message is delivered to UI via SSE. UI should render in some nice way showing the name and the reason.
