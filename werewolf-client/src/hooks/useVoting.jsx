import { useState } from 'react';
import { URL_API_START_VOTING, URL_API_ASK_CERTAIN_PLAYER_TO_VOTE, URL_API_SAVE_VOTING_RESULT } from '../Constants';

const useVoting = (setLoading, setMessages, playerIdMap, gameId) => {
    const [isVotingModalVisible, setVotingModalVisible] = useState(false);
    const [votingOrder, setVotingOrder] = useState([]);
    const [currentVoterIndex, setCurrentVoterIndex] = useState(0);
    const [votes, setVotes] = useState([]);

    const startVoting = async () => {
        setLoading(true);
        try {
            const response = await fetch(URL_API_START_VOTING, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gameId,
                }),
            });

            if (response.ok) {
                const startVotingMessage = await response.text();
                setMessages((prevMessages) => [
                    ...prevMessages,
                    {
                        key: Math.random().toString(36).substring(7),
                        text: startVotingMessage,
                        timestamp: new Date(),
                        isUserMessage: false,
                        author: 'Game Master',
                        authorColor: '#fff',
                    },
                ]);

                const playerIds = [...playerIdMap.values()];
                const humanPlayer = { id: 'human', name: 'Human' };
                const votingOrderWithHuman = [...playerIds, humanPlayer];
                setVotingOrder(shuffleArray(votingOrderWithHuman));
                setCurrentVoterIndex(0);
                setVotes([]);

                // Start bot voting
                await botVoting();
            } else {
                console.error('Error starting voting:', response.statusText);
            }
        } catch (error) {
            console.error('Error starting voting:', error);
        } finally {
            setLoading(false);
        }
    };

    const botVoting = async () => {
        for (let i = currentVoterIndex; i < votingOrder.length; i++) {
            const voter = votingOrder[i];
            const voterId = voter.id;

            if (voterId === 'human') {
                // Show voting modal for human player
                setVotingModalVisible(true);
                break;
            } else {
                // Bot player voting
                setLoading(true);
                try {
                    const response = await fetch(URL_API_ASK_CERTAIN_PLAYER_TO_VOTE, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            gameId,
                            participantId: voterId,
                        }),
                    });

                    if (response.ok) {
                        const votingResponse = await response.text();
                        const vote = {
                            voter: playerIdMap.get(voterId).name,
                            votedFor: extractVotedForName(votingResponse),
                            reason: extractReason(votingResponse),
                        };
                        setVotes((prevVotes) => [...prevVotes, vote]);
                        addVoteToMessages(vote);
                        setCurrentVoterIndex(i + 1);
                    } else {
                        console.error('Error asking bot to vote:', response.statusText);
                        break;
                    }
                } catch (error) {
                    console.error('Error asking bot to vote:', error);
                    break;
                } finally {
                    setLoading(false);
                }
            }
        }

        // Voting completed
        if (currentVoterIndex === votingOrder.length) {
            await countVotes();
        }
    };

    const handleVote = async (selectedParticipantId, reason) => {
        const vote = {
            voter: 'Human',
            votedFor: playerIdMap.get(selectedParticipantId).name,
            reason,
        };
        setVotes((prevVotes) => [...prevVotes, vote]);
        addVoteToMessages(vote);
        setVotingModalVisible(false);
        setCurrentVoterIndex((prevIndex) => prevIndex + 1);
        await botVoting();
    };

    const addVoteToMessages = (vote) => {
        const voteMessage = {
            key: Math.random().toString(36).substring(7),
            text: `${vote.voter} voted for ${vote.votedFor}. Reason: ${vote.reason}`,
            timestamp: new Date(),
            isUserMessage: false,
            author: vote.voter,
            authorColor: playerIdMap.get(vote.voterId)?.color || '#fff',
        };
        setMessages((prevMessages) => [...prevMessages, voteMessage]);
    };

    const extractVotedForName = (votingResponse) => {
        // Extract the voted-for name from the bot's voting response
        // Implement the logic based on the structure of the voting response
    };

    const extractReason = (votingResponse) => {
        // Extract the reason from the bot's voting response
        // Implement the logic based on the structure of the voting response
    };

    const countVotes = async () => {
        // Count the votes and determine the leaders
        const voteCount = votes.reduce((count, vote) => {
            count[vote.votedFor] = (count[vote.votedFor] || 0) + 1;
            return count;
        }, {});

        const leaders = Object.entries(voteCount)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${name}: ${count} vote(s)`)
            .join(', ');

        const resultMessage = `Voting Results:\n${leaders}`;
        setMessages((prevMessages) => [...prevMessages, { text: resultMessage, isUserMessage: false }]);

        // Save voting result to chat history
        try {
            await fetch(URL_API_SAVE_VOTING_RESULT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gameId,
                    resultMessage,
                }),
            });
        } catch (error) {
            console.error('Error saving voting result:', error);
        }
    };

    const shuffleArray = (array) => {
        const shuffledArray = [...array];
        for (let i = shuffledArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
        }
        return shuffledArray;
    };

    return {
        isVotingModalVisible,
        setVotingModalVisible,
        startVoting,
        handleVote,
    };
};

export default useVoting;