import {URL_API_GET_WELCOME_MESSAGE, URL_API_INIT_GAME, URL_API_LOAD_GAME} from "../Constants";

export const setGame = (game) => ({
    type: 'SET_GAME',
    payload: game,
});

export const updateGame = (updatedFields) => ({
    type: 'UPDATE_GAME',
    payload: updatedFields,
});

export const fetchGame = (gameId) => {
    return async (dispatch) => {
        try {
            const response = await fetch(`${URL_API_LOAD_GAME}/${gameId}`);
            const game = await extractGameFromResponse(response);

            dispatch(setGame(game));
        } catch (error) {
            console.error('Error fetching game data:', error);
        }
    };
};

export const createGame = (
    userName,
    gameName,
    gameTheme,
    gameMasterLLM,
    botPlayersLLM,
    selectedLanguage,
    setGameName,
    setGameTheme,
) => {
    return async (dispatch) => {
        const response = await fetch(URL_API_INIT_GAME, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userName,
                gameName,
                gameTheme,
                gameMasterLLM,
                botPlayersLLM,
                selectedLanguage,
            }),
        });
        if (response.ok) {
            const game = await extractGameFromResponse(response);
            dispatch(setGame(game));

            for (const bot of game.bots) {
                const welcomeResponse = await fetch(URL_API_GET_WELCOME_MESSAGE, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        'gameId': game.gameId,
                        'id': bot.id,
                    }),
                });
                if (welcomeResponse.ok) {
                    const welcomeMessageRaw = await welcomeResponse.text();
                    const welcomeMessage = welcomeMessageRaw.replace(/^"|"$/g, '');
                    const playerColor = bot.color;
                    game.messages.push(
                        {
                            key: Math.random().toString(36).substring(7),
                            text: welcomeMessage,
                            isUserMessage: false,
                            author: bot.name,
                            authorColor: playerColor,
                        }
                    );
                } else {
                    console.error('Error getting welcome message:', welcomeResponse.status);
                }
            }

            // setUserName('');
            setGameName('');
            setGameTheme('');
        } else {
            console.error('Error initializing game:', response.status);
        }
    };
};

async function extractGameFromResponse(response) {
    const data = await response.json();

    const idToColor = data.bot_players.reduce((map, obj) => {
        map[obj.id] = obj.color;
        return map;
    }, new Map());

    const formattedMessages = data.messages?.map((message, index) => ({
        key: `${index}`,
        text: message.msg,
        isUserMessage: message.role === 'USER',
        author: message.author_name,
        authorColor: idToColor[message.author_id] || '#fff',
    }));

    return {
        gameId: data.game_id,
        userName: data.user_name,
        bots: data.bot_players,
        messages: formattedMessages,
    };
}