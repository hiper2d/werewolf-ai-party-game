# Bugs and improvements

- Detective doesn't understand that they revealed a wolf. Need to inject this info more directly into some bots fields or append to summary
- Prepare the framework to easily add more roles
- No need to keep summaries from all days - regenerating summary should be enough ???
- Summaries seems to be detouched from roles. Bots summarize their day activities but there should be foes and friends with respect of roles as well.
- The previous days should include role messages in the human player can see them
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- "Keep Going" doesn't block the input while the game master is thinking. We should show the Game Master thinking in the queue probably...
- Track spendings in each tier separately for a user (no need to change anything for a game since games stick to certain tiers)
- The post game discussion needs some changes from the game: killed bots should also summarize so they know what is going on?
- Fix game buttons enablement: some of them are shown when they should not
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Optimize indexes in DB
- Automatically end up day discussion when each bot replied X times min
