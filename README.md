# Werewolf Party Game with AI Bots

<img src="images/werewolf-ai-logo-1.webp" width="600">

> [!IMPORTANT]  
> I'm reworking the app to the Next.js + Firebase stack. I'm throwing away the Python backend because I feel like switching to Next.js simplifies things a lot. It's a common app for both frontend and backend. Firebase gives me a database for games and chat messages which is easier to use than DynamoDb. Firebase also provides authentication and hosting.
> I plan to complete the redesign in 1-2 weeks. So far all the work in going on in the `nextjs-with-firebase` branch.

I created this repo for the Backdrop Build V3 hackathon on February 26, 2024. It was based on my other project [mafia-gpt](https://github.com/hiper2d/mafia-gpt). Mafia used OpenAI Assistants API which disappointed me a lot in process of development (slow, native client freezes randomly, outages on the OpenAI side), so I replaced it with a pure completion API. This gave me flexibility to switch between models (GPT-4, Claude3 Opus, Mistral Large, Grok 1.5 for now) but forced to store the chat history in DynamoDB. I like this approach so I deprecated mafia-gpt in favor of this repo.

All projects registry: [Builds](https://backdropbuild.com/builds)

The event project page: [ai-werewolf](https://backdropbuild.com/v3/ai-werewolf)

## Gameplay

What is nice about this game is complete freedom in the themes and roleplay. You can create any setting you want. A movie, a book, any historical period, or even a completely new world. The game is very flexible and can be adapted to any setting. 

Here is an example of the "Terminator" theme with AI bots roleplaying characters from the movie:
<img src="images/screen2.png">

Or "Lord of the Rings":
<img src="images/screen3.png">

I really like these thematic dialogs and how creative the bots are. 

UI is chunky and ugly yet but I'm working on it. It's a very early stage of the project. It is only possible to create a new game, to chat with bot players and to initiate a first round of voting. I have more things in the API but UI is not ready yet.

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
npm run pre-prod
```

This will start the Next.js application on `localhost:3000`.