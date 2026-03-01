# Bugs and improvements

- Models should be references by some ids and not by the exact models names. Come up with migration plan for existing games
- Update Gemini Flash to 3.1
- Bots should have better notion of day and night events ordering. Review the summary logic, it should have
  - Unified past days summary text
  - Past days voting results (who voted for whom, in what order; the reasons can be omitted)
  - Past nights results (who died and how, what else happened)
- Add payments
- Add fast Kimi models
- Make sure errors are shown on UI
- Add game rules page. Add hints to roles on the game prev
- Add Google voices
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Add GLM-5 model ?
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities