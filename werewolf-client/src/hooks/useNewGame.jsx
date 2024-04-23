import {GAME_MASTER_COLOR, URL_API_GET_WELCOME_MESSAGE, URL_API_INIT_GAME} from "../Constants";
import {getRandomColor, getUniqueColor} from "./colors";

const useNewGame = (
    setIsLoading,
    isModalVisible,
    setModalVisible,
    setMessages,
    userName,
    gameName,
    gameTheme,
    setGameId,
    setPlayerIdMap,
    setPlayerNameMap,
    setGameName,
    setGameTheme,
    gameMasterLLM,
    botPlayersLLM,
) => {
    const handleNewGameModalOkPress = async (

    ) => {
        setModalVisible(false);
        setIsLoading(true);
        try {
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
                    botPlayersLLM
                }),
            });
            if (response.ok) {
                const data = await response.json();
                console.log('New Game data:', data);
                const botPlayers = data.bot_players;
                const gameId = data.game_id;
                setGameId(gameId)
                const story = data.story;
                const humanPlayerRole = data.human_player_role;

                const newPlayerIdMap = new Map();
                const newPlayerNameMap = new Map();
                const usedColors = [];

                botPlayers.forEach(([playerId, playerName]) => {
                    const uniqueColor = getUniqueColor(usedColors);
                    newPlayerIdMap.set(playerId, { id: playerId, name: playerName, color: uniqueColor });
                    newPlayerNameMap.set(playerName, { id: playerId, name: playerName, color: uniqueColor });
                    usedColors.push(uniqueColor);
                });
                setPlayerIdMap(newPlayerIdMap);
                setPlayerNameMap(newPlayerNameMap);

                setMessages((previousMessages) => [
                    {
                        key: Math.random().toString(36).substring(7),
                        text: story,
                        timestamp: new Date(),
                        isUserMessage: false,
                        author: 'Game Master',
                        authorColor: GAME_MASTER_COLOR
                    },
                    {
                        key: Math.random().toString(36).substring(7),
                        text: `Your role is ${humanPlayerRole}`,
                        timestamp: new Date(),
                        isUserMessage: false,
                        author: 'Game Master',
                        authorColor: GAME_MASTER_COLOR,
                    },
                ]);

                for (const [playerId, playerName] of botPlayers) {
                    const welcomeResponse = await fetch(URL_API_GET_WELCOME_MESSAGE, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            'gameId': gameId,
                            'id': playerId
                        }),
                    });
                    if (welcomeResponse.ok) {
                        const welcomeMessageRaw = await welcomeResponse.text();
                        const welcomeMessage = welcomeMessageRaw.replace(/^"|"$/g, '');
                        const playerColor = newPlayerIdMap.get(playerId).color;
                        setMessages((previousMessages) => [
                            ...previousMessages,
                            {
                                key: Math.random().toString(36).substring(7),
                                text: welcomeMessage,
                                timestamp: new Date(),
                                isUserMessage: false,
                                author: playerName,
                                authorColor: playerColor,
                            },
                        ]);
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
        } catch (error) {
            console.error('Error initializing game:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        handleNewGameModalOkPress
    };
};

export default useNewGame;