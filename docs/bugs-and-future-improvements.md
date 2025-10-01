# Bugs and improvements

- Now, we need to implement the game creation following the Free Tier limitations (amount of models per game)
- Add cost tracking for each user and display it in profile
- Add tracking of audio tokens: https://platform.openai.com/docs/pricing
- Enable tts/sst for Free tier as well, update Profile
- Add cost usage to Gemini model depending on the context window size
- Rearrange layout: 
  - replace "Game Chat" with game day and phase;
  - move GM model and user role the list of participants
  - Move buttons section to the bottom right corner
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from 
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Optimize indexes in DB
- Automatically end up day discussion when each bot replied X times min
