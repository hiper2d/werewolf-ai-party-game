# Bugs and improvements

- The names selection mechanic requires changes. Weak models keep selecting the same players. I should add an option to select players myself
- Detective doesn't understand that they revealed a wolf. Need to inject this info more directly into some bots fields
  or append to summary
- Prepare the framework to easily add more roles
- No need to keep summaries from all days - regenerating summary should be enough ???
- Summaries seems to be detouched from roles. Bots summarize their day activities but there should be foes and friends
  with respect of roles as well.
- The previous days should include role messages in the human player can see them
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- "Keep Going" doesn't block the input while the game master is thinking. We should show the Game Master thinking in the
  queue probably...
- Track spendings in each tier separately for a user (no need to change anything for a game since games stick to certain
  tiers)
- The post game discussion needs some changes from the game: killed bots should also summarize so they know what is
  going on?
- Fix game buttons enablement: some of them are shown when they should not
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Optimize indexes in DB
- Automatically end up day discussion when each bot replied X times min
- Let bots and the human player to like and dislike day discussion messages

- When bots are voting, they don't know that at this stage discussions are over. This has to be clarified in the game
  rules. Right now, they find my comments to votes suspicious:

```txt
I appreciate your frustration—I share it, and I acknowledged my own part in yesterday's mistake.
But you're still dodging the core question: if you believed Draco innocent, why did your vote land on Hermione instead of 
abstaining or fighting to shift the consensus? That's not about blame, it's about understanding your logic. 
Ginny, voting for the 'least suspicious' deliberately inverts our only tool for catching wolves — I'd rather refine 
our methods than abandon them entirely.
```