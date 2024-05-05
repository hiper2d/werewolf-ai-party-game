import { useState } from 'react';
import { URL_API_START_VOTING, URL_API_ASK_CERTAIN_PLAYER_TO_VOTE, URL_API_SAVE_VOTING_RESULT } from '../Constants';

const useVoting = (setLoading, setMessages, userName, playerIdMap, gameId) => {
    const [isVotingModalVisible, setVotingModalVisible] = useState(false);

    const startVoting = async () => {
        setLoading(true);
        console.log("Starting voting... Username: ", userName);
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
                const humanPlayer = { id: 'human_id', name: userName };
                const votingOrderWithHuman = [...playerIds, humanPlayer];
                const votingOrder = shuffleArray(votingOrderWithHuman);
                console.log("Voting Order: ", votingOrder);

                // Start bot voting
                const votes = await botVoting(votingOrder);
                await countVotes(votes);
            } else {
                console.error('Error starting voting:', response.statusText);
            }
        } catch (error) {
            console.error('Error starting voting:', error);
        } finally {
            setLoading(false);
        }
    };

    const botVoting = async (votingOrder) => {
        const votes = [];
        for (let i = 0; i < votingOrder.length; i++) {
            const voter = votingOrder[i];
            const voterId = voter.id;
            console.log("Voter: ", voter);

            if (voterId === 'human_id') {
                // Show voting modal for human player
                setVotingModalVisible(true);
                // Wait for human player to vote
                const humanVote = await new Promise((resolve) => {
                    const handleVote = (selectedParticipantId, reason) => { // fixme: This part doesn't work. Need to return it so it can be used in the voting dialog
                        const vote = {
                            voter: userName,
                            votedFor: playerIdMap.get(selectedParticipantId).name,
                            reason,
                        };
                        resolve(vote);
                    };
                    // Pass the handleVote function to the voting modal
                    // You may need to modify the voting modal component to accept the handleVote function as a prop
                });
                votes.push(humanVote);
                addVoteToMessages(humanVote);
                setVotingModalVisible(false);
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
                        votes.push(vote);
                        addVoteToMessages(vote);
                    } else {
                        console.error('Error asking bot to vote:', response.statusText);
                    }
                } catch (error) {
                    console.error('Error asking bot to vote:', error);
                } finally {
                    setLoading(false);
                }
            }
        }
        return votes;
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
        const regex = /Name: (.+)\. Reason:/;
        const match = votingResponse.match(regex);
        return match ? match[1] : '';
    };

    const extractReason = (votingResponse) => {
        // Extract the reason from the bot's voting response
        const regex = /Reason: (.+)/;
        const match = votingResponse.match(regex);
        return match ? match[1] : '';
    };

    const countVotes = async (votes) => {
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
    };
};

export default useVoting;