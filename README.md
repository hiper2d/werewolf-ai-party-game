# Werewolf Party Game with AI Bots

<img src="images/werewolf-ai-logo-1.webp" width="600">

> [!IMPORTANT]  
> I'm reworking the app to the Next.js + Firebase stack. I'm throwing away the Python backend because I feel like switching to Next.js simplifies things a lot. It's a common app for both frontend and backend. Firebase gives me a database for games and chat messages which is easier to use than DynamoDb. Firebase also provides authentication and hosting.
> I plan to complete the redesign in 1-2 weeks. So far all the work in going on in the `nextjs-with-firebase` branch.

I created this repo for the Backdrop Build V3 hackathon on February 26, 2024. It was based on my other project [mafia-gpt](https://github.com/hiper2d/mafia-gpt). Mafia used OpenAI Assistants API which disappointed me a lot in process of development (slow, native client freezes randomly, outages on the OpenAI side), so I replaced it with a pure completion API. This gave me flexibility to switch between models (GPT-4, Claude3 Opus, Mistral Large, Grok 1.5 for now) but forced to store the chat history in DynamoDB. I like this approach so I deprecated mafia-gpt in favor of this repo.

All projects registry: [Builds](https://backdropbuild.com/builds)

The event project page: [ai-werewolf](https://backdropbuild.com/v3/ai-werewolf)

# Gameplay

What is nice about this game is complete freedom in the themes and roleplay. You can create any setting you want. A movie, a book, any historical period, or even a completely new world. The game is very flexible and can be adapted to any setting. 

Here is an example of the "Terminator" theme:
<img src="images/screen2.png">

Or "Lord of the Rings":
<img src="images/screen3.png">

I really like these thematic dialogs and how creative the bots are. 

UI is chunky and ugly yet but I'm working on it. It's a very early stage of the project. It is only possible to create a new game, to chat with bot players and to initiate a first round of voting. I have more things in the API but UI is not ready yet.

# Setup

To run the project locally, you need:
- Install Docker and Docker Compose, run local DynamoDb with `docker-compose up`
- Frontend: install node.js and npm, install dependencies with `npm install`, and run the app by `npm run web`
- Backend: install Python 3.11+ and Pypenv, install dependencies with `pipenv install`, and run the FastAPI server

### DynamoDB

I prefer to run it with Docker Compose. There is a firebase in the root directory, just run it. You need to have docker
and docker-compose installed.

```bash
docker-compose up
```

### Backend

# Setup firestore

This project uses Firestore and Authentication from Firebase. I don't remember the exact commands, but it should be easy using CLI.
I tried to use the Firebase Emulator at first but it was hard to make it work with Authentication so I gave up.

Here how I update indexes in my Firestore:
```bash
firebase deploy --only firestore:indexes
```

### Frontend and backend (next.js)

Install node.js and npm. Navigate to the `werewolf-client` and run:

```bash
npm install
npm run pre-prod
```

This will start the frontend on the `localhost:3000` address.

