<a href="images/werewolf-ai-logo-3.png" target="_blank"><img src="images/werewolf-ai-logo-3.png" width="600"></a>

This the Werewolf game with AI bots who are instructed to pretend to be humans. 
Who doesn't know about other AI in the game.
Who has its personal goals, a secret role and alliances.

## Gameplay

Create a game in the setting you like, it can be literally anything as long as models censorship allow

Configure your AI bots with:
- names
- models
- stories in the setting
- play styles (aggressive, protective, trickster, etc)
- voices

<a href="images/create_game2.png" target="_blank"><img src="images/create_game2.png" width="600"></a>

Chat or use Text-to-Sound and Sound-to-Text features.

You can follow the theme and roleplay, you can tell them that they are AI, you can try to jailbreak - whatever it takes to survive the voting and the game night.

<a href="images/day_chat1.png" target="_blank"><img src="images/day_chat1.png" width="600"></a>

Survival is not easy, poor Bob (me)

<a href="images/game_vote_all_for_bob.png" target="_blank"><img src="images/game_vote_all_for_bob.png" width="600"></a>

## AI

The game supports all the major latest models for the game master and bots:
- Open AI: `O3`, `O4-mini`, `GPT-4.1`
- Anthropic: `Claude 4 Opus`, `Claude 4 Sonnet`
- Google: `Gemini 2.5 Pro`
- DeepSeek: `Reasoner (R1)`, `Chat (V3)`
- Mistral: `Mistral 2 Large`, `Mistral 3 Small`
- Grok: `Grok-4`
- Moonshot AI: `Kimi K2`

I don't use any frameworks for AI, I created s simple agent for each vendor based on their native SDK.

### Stack

- next.js 15
- firebase: auth, firestore

## Setup

To run the project locally, you need:
1. Node.js and npm installed
2. Firebase project set up with Firestore and Authentication enabled

### Firebase Setup

This project uses Firestore and Authentication from Firebase. You'll need to:
1. Create a new Firebase project in the Firebase Console
2. Enable Firestore Database
3. Enable Authentication
4. Deploy Firestore indexes using Firebase CLI:
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Frontend Setup

Navigate to the `werewolf-client` directory and run:

```bash
npm install
npm run dev
```

This will start the Next.js application on `localhost:3000`.