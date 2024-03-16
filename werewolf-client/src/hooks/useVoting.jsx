import {URL_API_ASK_CERTAIN_PLAYER_TO_VOTE} from "../Constants";

const useVoting = (setIsLoading, setMessages, playerIdMap, gameId) => {
    const handleVotingPress = async () => {
        try {
            setIsLoading(true);
            const votingResults = new Map();
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

                        const { name, reason } = jsonResponse;

                        if (name) {
                            setMessages((previousMessages) => [
                                ...previousMessages,
                                {
                                    id: Math.random().toString(36).substring(7),
                                    text: `I vote for ${name}. Reason: ${reason}`,
                                    timestamp: new Date(),
                                    isUserMessage: false,
                                    author: playerIdMap.get(participantId).name,
                                    authorColor: playerIdMap.get(participantId).color,
                                },
                            ]);
                            if (votingResults.has(name)) {
                                votingResults.set(name, votingResults.get(name) + 1);
                            } else {
                                votingResults.set(name, 1);
                            }
                            console.log(`Voting result for ${participantId}: ${name} - ${reason}`);
                        } else {
                            console.log(`No player_to_eliminate field in response for participant ID ${participantId}`);
                        }
                    } else {
                        console.error('Error voting:', response.status);
                    }
                } catch (error) {
                    console.error('Error voting:', error);
                }
            }
            console.log(votingResults);
        } finally {
            setIsLoading(false)
        }
    };

    return {
        handleVotingPress
    };
};

export default useVoting;