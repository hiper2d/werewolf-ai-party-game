import { getGameMessages } from "../app/api/game-actions";

const gameId = process.argv[2];
if (!gameId) {
    console.error('Please provide a game ID');
    process.exit(1);
}

getGameMessages(gameId)
    .then(messages => console.log(JSON.stringify(messages, null, 2)))
    .catch(console.error);