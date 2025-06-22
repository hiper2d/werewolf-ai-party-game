The plan:
- Implement game actions
- Test bots more


Let's implement the werewolves night phase. I expect the following logic:
- check if the gameStateParamQueue field is empty
- if 
- in the beginning, we need check if we have more than 1 alive werewolf
- in case, it's only one, then we only put its name into the gameStateParamQueue as a single item array
- if there are more than 1 alive werewolves, then create a random array with each werewolf name present in it twice. To do so, create a random list  with werewolves name and append it to itself. Store the result array in the gameStateParamQueue field


When a bot reply JSON parting fails in the talkToAll or welcome functions, the application stuck in the error loop:
Error in talkToAll function: Error [BotResponseError]: Failed to parse bot response as JSON
at parseResponseToObj (app/utils/message-utils.ts:183:14)
at processNextBotInQueue (app/api/bot-actions.ts:527:40)
at async talkToAll (app/api/bot-actions.ts:252:12)
181 |     } catch (e) {
182 |         const { BotResponseError } = require('@/app/api/game-models');
> 183 |         throw new BotResponseError(
|              ^
184 |             'Failed to parse bot response as JSON',
185 |             `Invalid JSON format: ${(e as Error).message}`,
186 |             { {
details: `Invalid JSON format: Unexpected token 'I', "I've been "... is not valid JSON`,
context: [Object],
recoverable: true
}

I want this type of response errors to interrupt the game and show the message in the error banner