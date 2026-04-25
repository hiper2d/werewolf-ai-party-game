# Bugs and improvements

- Update models:
  - Opus 4.7
  - Kimi 2.6
  - DeepSeek v4
- Mark some models as "fast" and let to select only fast models when generating preview
- Fix prompting for ordering and summaries:
- Bots should have better notion of day and night events ordering. Review the summary logic, it should have
  - Unified past days summary text
  - Past days voting results (who voted for whom, in what order; the reasons can be omitted)
  - Past nights results (who died and how, what else happened)
- Add game rules page. Add hints to roles on the game prev
- Add fast Kimi models
- Add Google voices
- Need to refactor agent answer type determination in parseResponseToObj function. It doesn't use types from
- When bot votes or speaks, the scroll is not moving on UI
- Resolve vote tie by asking Detective to choose
- Add GLM-5 model ?
- When night starts, the Game Master's messages should tell the human player what to do then it's their turn
- Change bots prompting to explain that random voting is not something suspicious. People do this. Maybe add it to
  personalities