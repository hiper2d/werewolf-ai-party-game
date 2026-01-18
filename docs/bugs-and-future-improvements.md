# Bugs and improvements

- Prepare the framework to easily add more roles
- Make button click interactive and prevent somehow double clicks with respect of roles as well.
- "Keep Going" doesn't block the input while the game master is thinking. We should show the Game Master thinking in the
  queue probably... tiers)
- Fix game buttons enablement: some of them are shown when they should not
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Optimize indexes in DB
- Let bots and the human player to like and dislike day discussion messages
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities.