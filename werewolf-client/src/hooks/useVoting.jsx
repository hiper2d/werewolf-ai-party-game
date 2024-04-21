import {URL_API_ASK_CERTAIN_PLAYER_TO_VOTE} from "../Constants";

const useVoting = (setIsLoading, setMessages, playerIdMap, gameId) => {
    const handleVotingPress = async () => {
        try {
            setIsLoading(true);
            const participantIds = Array.from(playerIdMap.keys());
            for (let participantId of participantIds) {
                try {
                    const response = await fetch(URL_API_ASK_CERTAIN_PLAYER_TO_VOTE, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({gameId, participantId}),
                    });

                    if (response.ok) {
                        const jsonResponse = await response.json();
                        console.log(jsonResponse);

                        const voteMessage = jsonResponse;

                        setMessages((previousMessages) => [
                            ...previousMessages,
                            {
                                id: Math.random().toString(36).substring(7),
                                text: voteMessage,
                                timestamp: new Date(),
                                isUserMessage: false,
                                author: playerIdMap.get(participantId).name,
                                authorColor: playerIdMap.get(participantId).color,
                            },
                        ]);
                    } else {
                        console.error('Error voting:', response.status);
                    }
                } catch (error) {
                    console.error('Error voting:', error);
                }
            }
        } finally {
            setIsLoading(false)
        }
    };

    return {
        handleVotingPress
    };
};

export default useVoting;