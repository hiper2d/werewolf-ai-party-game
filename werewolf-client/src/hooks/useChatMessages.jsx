import {URL_API_TALK_TO_ALL, URL_API_TALK_TO_CERTAIN_PLAYER} from "../Constants";
import {useState} from "react";

const useChatMessages = (setIsLoading, gameId, userName, playerNameMap) => {
    const [messages, setMessages] = useState([
    ]);

    const sendMessage = async (inputText) => {
        setIsLoading(true);
        if (inputText.trim()) {
            const newMessage = {
                key: Math.random().toString(36).substring(7),
                text: inputText.trim(),
                timestamp: new Date(),
                isUserMessage: true,
                author: userName,
            };

            setMessages((previousMessages) => [...previousMessages, newMessage]);

            try {
                const response = await fetch(URL_API_TALK_TO_ALL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gameId: gameId,
                        message: newMessage.text,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const playersToReply = data.players_to_reply;

                    for (const playerName of playersToReply) {
                        const replyResponse = await fetch(URL_API_TALK_TO_CERTAIN_PLAYER, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                gameId: gameId,
                                playerId: playerNameMap.get(playerName).id  // todo: check if a name is in the map
                            }),
                        });

                        if (replyResponse.ok) {
                            let replyMessage = await replyResponse.text();
                            const player = Array.from(playerNameMap.values()).find(p => p.name === playerName);
                            const playerColor = player?.color;

                            replyMessage = replyMessage.replace(/^"|"$/g, '');
                            setMessages((previousMessages) => [
                                ...previousMessages,
                                {
                                    key: Math.random().toString(36).substring(7),
                                    text: replyMessage,
                                    timestamp: new Date(),
                                    isUserMessage: false,
                                    author: player?.name || 'Unknown',
                                    authorColor: playerColor,
                                },
                            ]);
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
        messages,
        setMessages,
        sendMessage,
    };
};

export default useChatMessages;