# Bugs and improvements

- Implement Axiom logging in vercel
- Add game rules page. Add hints to roles on the game prev
- Add Google voices
- "Keep Going" doesn't block the input while the game master is thinking. We should show the Game Master thinking in the
- When sending a message to the chat, it's not quite clear on UI what is going on. Need to add some sort of loader.
- Change bot's night event capturing logic: include GMs text but also the resolvedNightState (only killed players and
  skipped roles with no details)
- Make button click interactive and prevent somehow double clicks with respect of roles as well.
  queue probably... tiers)
- Figure out how to get reasoning tokens from Grok models
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Optimize indexes in DB
- Let bots and the human player to like and dislike day discussion messages ?
- Add GLM-5 model ?
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities.