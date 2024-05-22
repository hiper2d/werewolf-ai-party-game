import {URL_API_TALK_TO_ALL, URL_API_TALK_TO_CERTAIN_PLAYER} from "../Constants";
import {useSelector} from "react-redux";

const useChatMessages = (setIsLoading) => {
    const game = useSelector((state) => state.game);

    const sendMessage = async (inputText, setInputtext) => {
        setIsLoading(true);
        if (inputText.trim()) {
            const newMessage = {
                key: Math.random().toString(36).substring(7),
                text: inputText.trim(),
                timestamp: new Date(),
                isUserMessage: true,
                author: game.userName,
            };
            game?.messages?.push(newMessage);
            setInputtext('');
            try {
                const response = await fetch(URL_API_TALK_TO_ALL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gameId: game.gameId,
                        message: newMessage.text,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const playersToReply = data.players_to_reply;

                    console.log(game)
                    const nameToId = game.bots?.reduce((map, obj) => {
                        map[obj.name] = obj.id;
                        return map;
                    }, new Map());
                    const nameToColor = game.bots?.reduce((map, obj) => {
                        map[obj.name] = obj.color;
                        return map;
                    }, new Map());

                    for (const playerName of playersToReply) {
                        const replyResponse = await fetch(URL_API_TALK_TO_CERTAIN_PLAYER, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                gameId: game.gameId,
                                playerId: nameToId[playerName]
                            }),
                        });

                        if (replyResponse.ok) {
                            let replyMessage = await replyResponse.text();

                            replyMessage = replyMessage.replace(/^"|"$/g, '');
                            game?.messages?.push({
                                key: Math.random().toString(36).substring(7),
                                text: replyMessage,
                                isUserMessage: false,
                                author: playerName,
                                authorColor: nameToColor[playerName] || '#fff',
                            });
                        } else {
                            console.error('Error getting reply:', replyResponse.status);
                        }
                    }
                } else {
                    console.error('Error sending message:', response.status);
                }
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
        setIsLoading(false);
    };

    return {
        sendMessage,
    };
};

export default useChatMessages;