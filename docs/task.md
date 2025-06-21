Now, let's impre the bots temperament. First, let's rename    │
│   it into play style. I want to have 3 play styles: agressive,  │
│   suspicious, team player. Each bot should have one randomly    │
│   selected. We should show this selection in a dropdown for     │
│   each bot in the game preview, so the user can change that if  │
│   they want. Create some config for play styles with the name   │
│   and description in the                                        │
│   @werewolf-client/app/api/game-models.ts . In the game         │
│   preview page, show a question icod near the playstyle         │
│   dropdown which the description for the selected playstyle.    │
│                                                                 │
│   Here is what I expect from play styles:                       │
│   - aggressive: constantly accuse all other players of being    │
│   associated with werewolves  to see how they react; believes   │
│   that this is the best way to catch players on lies; in case,  │
│   the bot is a werewolve itself, then false accusisions of      │
│   other players help to pretent of being a vilager              │
│   - suspicions: this play style randomly choose 2 other         │
│   players and suspect them of being werewolves. The player      │
│   names should be selected when the game is creted and          │
│   injected into the play style description for that bot         │
│   - team player: focus on teaming up with certain players who   │
│   most likely are not werewolves 