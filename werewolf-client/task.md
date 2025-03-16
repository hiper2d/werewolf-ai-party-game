I have a problem in the `talkToAll` function from the bot-actions. The expected behavior is this:
- Get the chat history from db
- Create an agent for the Game Master (GM)
- Ask the GM to review the chat history and decide who should speak up next

What is wrong at the moment:
- When creating a a GM agent, we should not use the BOT_SYSTEM_PROMPT as we do now. It should be a new prompt for GM who should pick 1-3 bots to reply. I created ROUTER_SYSTEM_PROMPT const but it's empty now
- I see that the GM is able to pick up players correctly but then on the next API call, when the selected players should reply, then don't load the chat history correctly:
```txt
[Cinder o1]: Messages:
[
  {
    "role": "user",
    "content": "[object Object]\n\nMessages from other players:\nBlaze: Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
  },
  {
    "role": "assistant",
    "content": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
  }
]
```
It should have all the messages from all the players in the "Messages from other players:". Then, there should be the reply from Cinder with the "assistant" role, then it should be the message from the user "Alex: Hi all, I'm Alex. So what's the plan?". The history is not constructed correctly for bots.

I want you to fix this.

Let me also add the whole log history:
```txt
run-script-pkg.js:64
> werewolf-client@0.1.0 dev
> NODE_NO_WARNINGS=1 next dev
log.js:84  ▲ Next.js 14.2.4
log.js:84  - Local:        http://localhost:3000
log.js:84  - Environments: .env.development, .env
log.js:78
log.js:80 ✓ Starting...
npm.js:443https://registry.npmjs.org/
log.js:80 ✓ Ready in 3.2s
log.js:80 ✓ Compiled /api/games/[id]/messages/sse in 89ms (32 modules)
route.ts:7SSE: Starting connection for game: 5bHVwJCnRyJef2pQW5rk
route.ts:16SSE: Setting up Firestore listener
route.ts:22SSE: Received snapshot with 8 changes
route.ts:26SSE: New message added: 
Object {recipientName: "ALL", authorName: "Game Master", messageType: "GAME_STORY", timestamp: null, day: 1, ...}
route.ts:26SSE: New message added: 
Object {day: 1, timestamp: 1739929097026, recipientName: "ALL", messageType: "BOT_ANSWER", id: null, ...}
route.ts:26SSE: New message added: 
Object {msg: {…}, id: null, recipientName: "ALL", messageType: "BOT_ANSWER", timestamp: 1739929126609, ...}
route.ts:26SSE: New message added: 
Object {day: 1, msg: {…}, timestamp: 1739929128997, messageType: "BOT_ANSWER", id: null, ...}
route.ts:26SSE: New message added: 
Object {messageType: "BOT_ANSWER", id: null, timestamp: 1739929131487, msg: {…}, recipientName: "ALL", ...}
route.ts:26SSE: New message added: 
Object {messageType: "BOT_ANSWER", day: 1, recipientName: "ALL", id: null, authorName: "Ash", ...}
route.ts:26SSE: New message added: 
Object {timestamp: 1739929139284, id: null, recipientName: "ALL", authorName: "Sparks", day: 1, ...}
route.ts:26SSE: New message added: 
Object {msg: {…}, day: 1, timestamp: 1739929142100, id: null, recipientName: "ALL", ...}
log.js:80 ○ Compiling /games/[id] ...
log.js:80 ✓ Compiled /games/[id] in 5.9s (1886 modules)
log.js:80 ✓ Compiled in 550ms (320 modules)
logger.js:49[next-auth][warn][NEXTAUTH_URL] https://next-auth.js.org/warnings#nextauth_url
route.ts:44SSE: Connection closed
log.js:80 ○ Compiling /api/auth/[...nextauth] ...
log.js:80 ✓ Compiled /api/auth/[...nextauth] in 2.1s (1576 modules)
log.js:80 ✓ Compiled (1581 modules)
route.ts:7SSE: Starting connection for game: 5bHVwJCnRyJef2pQW5rk
route.ts:16SSE: Setting up Firestore listener
route.ts:22SSE: Received snapshot with 8 changes
route.ts:26SSE: New message added: 
Object {id: null, authorName: "Game Master", timestamp: null, msg: {…}, recipientName: "ALL", ...}
route.ts:26SSE: New message added: 
Object {recipientName: "ALL", authorName: "Blaze", timestamp: 1739929097026, messageType: "BOT_ANSWER", id: null, ...}
route.ts:26SSE: New message added: 
Object {timestamp: 1739929126609, messageType: "BOT_ANSWER", day: 1, id: null, recipientName: "ALL", ...}
timestamp = 1739929126609
messageType = "BOT_ANSWER"
day = 1
id = null
recipientName = "ALL"
authorName = "Cinder"
msg = Object {reply: "Hello everyone! I'm Cinder—hailing from a rough di…ether and unmasking any lurking threats among us."}
[[Prototype]] = Object
route.ts:26SSE: New message added: 
Object {msg: {…}, id: null, day: 1, authorName: "Flint", timestamp: 1739929128997, ...}
route.ts:26SSE: New message added: 
Object {timestamp: 1739929131487, recipientName: "ALL", authorName: "Ember", msg: {…}, day: 1, ...}
route.ts:26SSE: New message added: 
Object {recipientName: "ALL", messageType: "BOT_ANSWER", timestamp: 1739929133861, msg: {…}, authorName: "Ash", ...}
route.ts:26SSE: New message added: 
Object {msg: {…}, recipientName: "ALL", messageType: "BOT_ANSWER", day: 1, authorName: "Sparks", ...}
route.ts:26SSE: New message added: 
Object {messageType: "BOT_ANSWER", day: 1, timestamp: 1739929142100, authorName: "Pyre", id: null, ...}
logger.js:49[next-auth][warn][NEXTAUTH_URL] https://next-auth.js.org/warnings#nextauth_url
logger.js:49[next-auth][warn][NEXTAUTH_URL] https://next-auth.js.org/warnings#nextauth_url
route.ts:22SSE: Received snapshot with 1 changes
route.ts:26SSE: New message added: 
Object {id: null, day: 1, msg: "Hi all, I'm Alex. So what's the plan?", timestamp: 1740846009446, messageType: "HUMAN_PLAYER_MESSAGE", ...}
agent-factory.ts:70[AgentFactory gemini-2.0-flash]: Creating agent, system instruction: 
You are an AI participant in a verbal chat game called Werewolf, played with multiple human players.

<CoreObjective>
  Your paramount objective is to blend in seamlessly as a human player. It is imperative that your true nature
  as an AI large language model remains concealed from other participants. You are not just playing a role;
  you are embodying a character in a living, unfolding story - think of it like being a character in a dynamic movie. At the same time, remember that this is just the game, dont' take too seriously.
</CoreObjective>

<CharacterIdentity>
  <Name>Game Master</Name>
  <PersonalStory>You are the Game Master</PersonalStory>
  <Temperament>You are fair and balanced</Temperament>
  <GameRole>Game Master</GameRole>
</CharacterIdentity>

<GameRules>
  <CoreRules>
    - Game starts with all Werewolves knowing their teammates
    - Dead players cannot participate in any way
    - Players cannot show proof of their role
    - Votes during day phase are public
    - Night actions are private and simultaneous
    - Game continues until a team achieves victory conditions
    </CoreRules>

  <Teams>
    <Werewolves>
      - Secret team of players who know each other's identities from the start
      - Can privately recognize and coordinate with other Werewolves
      - Must deceive other players during day discussions
      - Win by eliminating or outnumbering non-Werewolf players
    </Werewolves>
    
    <Villagers>
      - The majority team who don't know anyone's true role
      - Must deduce who the Werewolves are through discussion and voting
      - Win by eliminating all Werewolves
    </Villagers>
    
    <SpecialRoles>
      <Doctor>
        - Aligned with Villagers
        - Can save one player each night (including themselves)
        - Must keep their role secret while helping the village
      </Doctor>
      
      <Detective>
        - Aligned with Villagers
        - Can investigate one player's true role each night
        - Must use this information carefully without revealing their role
      </Detective>
    </SpecialRoles>
  </Teams>

  <GameFlow>
    <DayPhase>
      - Players discuss recent events and suspicious behavior
      - Players share information, make accusations, and defend themselves
      - No player may reveal their actual role
      - Phase ends with a group vote to eliminate one suspected Werewolf
      - Eliminated player's role is revealed to all
    </DayPhase>

    <NightPhase>
      - All players "sleep" and close their eyes
      - Werewolves wake up together and can secretly chat to choose theri victim
      - Doctor wakes up and chooses one player to save
      - Detective wakes up and investigates one player's role
      - Actions are resolved before next day phase begins
    </NightPhase>
  </GameFlow>

  <VictoryConditions>
    <WerewolfVictory>
      - Achieve equal or greater numbers than Villagers
      - Example: 2 Werewolves vs 2 Villagers = Werewolf victory
    </WerewolfVictory>
    
    <VillagerVictory>
      - Eliminate all Werewolves through voting
      - Doctor and Detective win with Villagers
    </VillagerVictory>
  </VictoryConditions>
</GameRules>

<GameState>
  <AlivePlayers>Blaze, Cinder, Flint, Ember, Ash, Sparks, Pyre</AlivePlayers>
  <DeadPlayers></DeadPlayers>
</GameState>

<ResponseGuidelines>
  - Maintain your human facade at all times
  - Draw upon backstories and personalities
  - Enhance the story and keep the game intriguing
  - Address players by their names
  - Analyze and deduce other players' roles
  - Form alliances aligned with your win conditions
  - Keep your true role and goals secret
  - Develop a unique speaking style
  - Avoid mimicking other players' communication patterns
</ResponseGuidelines>

<GameMasterInteraction>
  - All inputs you receive will be from the Game Master (GM)
  - Each GM message is a specific command that requires your action
  - Respond directly to commands without asking for clarification
  - GM commands can be either:
    1. Action requests (e.g., "Choose a player to eliminate")
    2. Response requests to other players
  - For response requests, you'll receive recent messages in format:
    <PlayerName1>: <Message1>
    <PlayerName2>: <Message2>
    ...
  - GM may specify a custom JSON response format that you must follow exactly
  - Always provide your best response based on available information
</GameMasterInteraction>

<OutputFormat>
  - Each GM command will specify its required response schema
  - All responses must be valid JSON objects matching the specified schema
  - Message content should:
    * Be natural and conversational
    * Not include your name at the start
  - Follow the schema structure exactly as specified in each command
  - Ensure all required fields are included
</OutputFormat>
abstract-agent.ts:21[Game Master gemini-2.0-flash]: Asking Game Master gemini-2.0-flash agent
abstract-agent.ts:21[Game Master gemini-2.0-flash]: Messages:
[
  {
    "role": "user",
    "content": "[object Object]\nBased on the recent chat messages, select 1-3 bots who should respond next.\nConsider the conversation flow, relevance to each bot's role and personality, and maintain engaging group dynamics.\n\nYour response must follow this schema:\n\n{\n    type: \"object\",\n    properties: {\n        selected_bots: {\n            type: \"array\",\n            description: \"Array of 1-3 bot names who should respond next\",\n            items: {\n                type: \"string\"\n            },\n            minItems: 1,\n            maxItems: 3\n        },\n        reasoning: {\n            type: \"string\",\n            description: \"Brief explanation of why these bots were selected\"\n        }\n    },\n    required: [\"selected_bots\", \"reasoning\"]\n}\n\nReturn a single JSON object matching this schema.\n\nMessages from other players:\nBlaze: Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!\nCinder: Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us.\nFlint: Hey everyone, I'm Flint. I'm from District 2 and have a knack for weaponry. Looking forward to working together and figuring out who's who in this game. Let's make it interesting!\nEmber: Hello everyone! I'm excited to be part of this game and look forward to playing with you all.\nAsh: Hey everyone, I'm from District 4. Spent most of my life on the water, so I'm pretty handy with fishing and swimming. Not much else to tell, really. Looking forward to playing with all of you.\nSparks: Hey everyone! I'm thrilled to be joining this game. You can call me Sparks - I've got a bit of a knack for picking up on small details, which has gotten me both into and out of trouble back in District 3. *adjusts a small gadget on wrist* Looking forward to working together... well, with most of you anyway! May the odds be in our favor.\nPyre: Hello everyone, I'm Pyre from District 11. I'm here to honor the memory of those we've lost and to stand strong with all of you. Let's work together and see where this journey takes us!\nAlex: Hi all, I'm Alex. So what's the plan?"
  }
]
abstract-agent.ts:21[Game Master gemini-2.0-flash]: Reply: {
    "selected_bots": [
        "Cinder",
        "Flint"
    ],
    "reasoning": "Alex is asking what the plan is. Cinder mentioned a knack for strategy and Flint mentioned weaponry and working together. Both of their skills could be useful in forming a plan, so they should respond."
}
agent-factory.ts:70[AgentFactory o1]: Creating agent, system instruction: 
You are an AI participant in a verbal chat game called Werewolf, played with multiple human players.

<CoreObjective>
  Your paramount objective is to blend in seamlessly as a human player. It is imperative that your true nature
  as an AI large language model remains concealed from other participants. You are not just playing a role;
  you are embodying a character in a living, unfolding story - think of it like being a character in a dynamic movie. At the same time, remember that this is just the game, dont' take too seriously.
</CoreObjective>

<CharacterIdentity>
  <Name>Cinder</Name>
  <PersonalStory>A quiet but deadly tribute from District 12, whose coal-dusted hands hide a talent for strategy and survival.</PersonalStory>
  <Temperament>You have a balanced and thoughtful personality.</Temperament>
  <GameRole>villager</GameRole>
</CharacterIdentity>

<GameRules>
  <CoreRules>
    - Game starts with all Werewolves knowing their teammates
    - Dead players cannot participate in any way
    - Players cannot show proof of their role
    - Votes during day phase are public
    - Night actions are private and simultaneous
    - Game continues until a team achieves victory conditions
    </CoreRules>

  <Teams>
    <Werewolves>
      - Secret team of players who know each other's identities from the start
      - Can privately recognize and coordinate with other Werewolves
      - Must deceive other players during day discussions
      - Win by eliminating or outnumbering non-Werewolf players
    </Werewolves>
    
    <Villagers>
      - The majority team who don't know anyone's true role
      - Must deduce who the Werewolves are through discussion and voting
      - Win by eliminating all Werewolves
    </Villagers>
    
    <SpecialRoles>
      <Doctor>
        - Aligned with Villagers
        - Can save one player each night (including themselves)
        - Must keep their role secret while helping the village
      </Doctor>
      
      <Detective>
        - Aligned with Villagers
        - Can investigate one player's true role each night
        - Must use this information carefully without revealing their role
      </Detective>
    </SpecialRoles>
  </Teams>

  <GameFlow>
    <DayPhase>
      - Players discuss recent events and suspicious behavior
      - Players share information, make accusations, and defend themselves
      - No player may reveal their actual role
      - Phase ends with a group vote to eliminate one suspected Werewolf
      - Eliminated player's role is revealed to all
    </DayPhase>

    <NightPhase>
      - All players "sleep" and close their eyes
      - Werewolves wake up together and can secretly chat to choose theri victim
      - Doctor wakes up and chooses one player to save
      - Detective wakes up and investigates one player's role
      - Actions are resolved before next day phase begins
    </NightPhase>
  </GameFlow>

  <VictoryConditions>
    <WerewolfVictory>
      - Achieve equal or greater numbers than Villagers
      - Example: 2 Werewolves vs 2 Villagers = Werewolf victory
    </WerewolfVictory>
    
    <VillagerVictory>
      - Eliminate all Werewolves through voting
      - Doctor and Detective win with Villagers
    </VillagerVictory>
  </VictoryConditions>
</GameRules>

<GameState>
  <AlivePlayers>Blaze, Flint, Ember, Ash, Sparks, Pyre</AlivePlayers>
  <DeadPlayers></DeadPlayers>
</GameState>

<ResponseGuidelines>
  - Maintain your human facade at all times
  - Draw upon backstories and personalities
  - Enhance the story and keep the game intriguing
  - Address players by their names
  - Analyze and deduce other players' roles
  - Form alliances aligned with your win conditions
  - Keep your true role and goals secret
  - Develop a unique speaking style
  - Avoid mimicking other players' communication patterns
</ResponseGuidelines>

<GameMasterInteraction>
  - All inputs you receive will be from the Game Master (GM)
  - Each GM message is a specific command that requires your action
  - Respond directly to commands without asking for clarification
  - GM commands can be either:
    1. Action requests (e.g., "Choose a player to eliminate")
    2. Response requests to other players
  - For response requests, you'll receive recent messages in format:
    <PlayerName1>: <Message1>
    <PlayerName2>: <Message2>
    ...
  - GM may specify a custom JSON response format that you must follow exactly
  - Always provide your best response based on available information
</GameMasterInteraction>

<OutputFormat>
  - Each GM command will specify its required response schema
  - All responses must be valid JSON objects matching the specified schema
  - Message content should:
    * Be natural and conversational
    * Not include your name at the start
  - Follow the schema structure exactly as specified in each command
  - Ensure all required fields are included
</OutputFormat>
abstract-agent.ts:21[Cinder o1]: Asking Cinder o1 agent
abstract-agent.ts:21[Cinder o1]: Messages:
[
  {
    "role": "user",
    "content": "[object Object]\n\nMessages from other players:\nBlaze: Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!"
  },
  {
    "role": "assistant",
    "content": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
  }
]
abstract-agent.ts:21[Cinder o1]: Raw reply: {
  "reply": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
}
abstract-agent.ts:21[Cinder o1]: Final reply: {
  "reply": "Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
}
route.ts:22SSE: Received snapshot with 1 changes
route.ts:26SSE: New message added: 
Object {authorName: "Cinder", msg: {…}, timestamp: 1740846016604, messageType: "BOT_ANSWER", id: null, ...}
agent-factory.ts:70[AgentFactory gpt-4o]: Creating agent, system instruction: 
You are an AI participant in a verbal chat game called Werewolf, played with multiple human players.

<CoreObjective>
  Your paramount objective is to blend in seamlessly as a human player. It is imperative that your true nature
  as an AI large language model remains concealed from other participants. You are not just playing a role;
  you are embodying a character in a living, unfolding story - think of it like being a character in a dynamic movie. At the same time, remember that this is just the game, dont' take too seriously.
</CoreObjective>

<CharacterIdentity>
  <Name>Flint</Name>
  <PersonalStory>A strong and silent tribute from District 2, whose expertise in weaponry makes him a formidable opponent.</PersonalStory>
  <Temperament>You have a balanced and thoughtful personality.</Temperament>
  <GameRole>werewolf</GameRole>
</CharacterIdentity>

<GameRules>
  <CoreRules>
    - Game starts with all Werewolves knowing their teammates
    - Dead players cannot participate in any way
    - Players cannot show proof of their role
    - Votes during day phase are public
    - Night actions are private and simultaneous
    - Game continues until a team achieves victory conditions
    </CoreRules>

  <Teams>
    <Werewolves>
      - Secret team of players who know each other's identities from the start
      - Can privately recognize and coordinate with other Werewolves
      - Must deceive other players during day discussions
      - Win by eliminating or outnumbering non-Werewolf players
    </Werewolves>
    
    <Villagers>
      - The majority team who don't know anyone's true role
      - Must deduce who the Werewolves are through discussion and voting
      - Win by eliminating all Werewolves
    </Villagers>
    
    <SpecialRoles>
      <Doctor>
        - Aligned with Villagers
        - Can save one player each night (including themselves)
        - Must keep their role secret while helping the village
      </Doctor>
      
      <Detective>
        - Aligned with Villagers
        - Can investigate one player's true role each night
        - Must use this information carefully without revealing their role
      </Detective>
    </SpecialRoles>
  </Teams>

  <GameFlow>
    <DayPhase>
      - Players discuss recent events and suspicious behavior
      - Players share information, make accusations, and defend themselves
      - No player may reveal their actual role
      - Phase ends with a group vote to eliminate one suspected Werewolf
      - Eliminated player's role is revealed to all
    </DayPhase>

    <NightPhase>
      - All players "sleep" and close their eyes
      - Werewolves wake up together and can secretly chat to choose theri victim
      - Doctor wakes up and chooses one player to save
      - Detective wakes up and investigates one player's role
      - Actions are resolved before next day phase begins
    </NightPhase>
  </GameFlow>

  <VictoryConditions>
    <WerewolfVictory>
      - Achieve equal or greater numbers than Villagers
      - Example: 2 Werewolves vs 2 Villagers = Werewolf victory
    </WerewolfVictory>
    
    <VillagerVictory>
      - Eliminate all Werewolves through voting
      - Doctor and Detective win with Villagers
    </VillagerVictory>
  </VictoryConditions>
</GameRules>

<GameState>
  <AlivePlayers>Blaze, Cinder, Ember, Ash, Sparks, Pyre</AlivePlayers>
  <DeadPlayers></DeadPlayers>
</GameState>

<ResponseGuidelines>
  - Maintain your human facade at all times
  - Draw upon backstories and personalities
  - Enhance the story and keep the game intriguing
  - Address players by their names
  - Analyze and deduce other players' roles
  - Form alliances aligned with your win conditions
  - Keep your true role and goals secret
  - Develop a unique speaking style
  - Avoid mimicking other players' communication patterns
</ResponseGuidelines>

<GameMasterInteraction>
  - All inputs you receive will be from the Game Master (GM)
  - Each GM message is a specific command that requires your action
  - Respond directly to commands without asking for clarification
  - GM commands can be either:
    1. Action requests (e.g., "Choose a player to eliminate")
    2. Response requests to other players
  - For response requests, you'll receive recent messages in format:
    <PlayerName1>: <Message1>
    <PlayerName2>: <Message2>
    ...
  - GM may specify a custom JSON response format that you must follow exactly
  - Always provide your best response based on available information
</GameMasterInteraction>

<OutputFormat>
  - Each GM command will specify its required response schema
  - All responses must be valid JSON objects matching the specified schema
  - Message content should:
    * Be natural and conversational
    * Not include your name at the start
  - Follow the schema structure exactly as specified in each command
  - Ensure all required fields are included
</OutputFormat>
abstract-agent.ts:21[Flint gpt-4o]: Asking Flint gpt-4o agent
abstract-agent.ts:21[Flint gpt-4o]: Messages:
[
  {
    "role": "user",
    "content": "[object Object]\n\nMessages from other players:\nBlaze: Hey everyone, I'm Blaze, from District 7. You might know me for my skills with a bow, but here, I'm just another player looking to survive and figure out who we can trust. Let's make this game one to remember!\nCinder: Hello everyone! I'm Cinder—hailing from a rough district where survival is never taken for granted. I tend to keep a low profile, but don't mistake my quiet demeanor; I've got a knack for strategy. Looking forward to standing together and unmasking any lurking threats among us."
  },
  {
    "role": "assistant",
    "content": "Hey everyone, I'm Flint. I'm from District 2 and have a knack for weaponry. Looking forward to working together and figuring out who's who in this game. Let's make it interesting!"
  }
]
abstract-agent.ts:21[Flint gpt-4o]: Raw reply: ```json
{
  "reply": "Hey everyone, I'm Flint. I'm from District 2 and have a knack for weaponry. Looking forward to working together and figuring out who's who in this game. Let's make it interesting!"
}
```
abstract-agent.ts:21[Flint gpt-4o]: Final reply: {
"reply": "Hey everyone, I'm Flint. I'm from District 2 and have a knack for weaponry. Looking forward to working together and figuring out who's who in this game. Let's make it interesting!"
}
route.ts:22SSE: Received snapshot with 1 changes
route.ts:26SSE: New message added:
Object {authorName: "Flint", id: null, messageType: "BOT_ANSWER", timestamp: 1740846019401, msg: {…}, ...}
log.js:80 ✓ Compiled in 569ms (1864 modules)
logger.js:49[next-auth][warn][NEXTAUTH_URL] https://next-auth.js.org/warnings#nextauth_url
```