import { useState } from 'react';
import { URL_API_START_VOTING, URL_API_ASK_CERTAIN_PLAYER_TO_VOTE, URL_API_PROCESS_VOTING_RESULT } from '../Constants';
import {useSelector} from "react-redux";

const useVoting = (setLoading) => {
    const [isVotingModalVisible, setVotingModalVisible] = useState(false);
    const [resolve, setResolve] = useState(null);

    const game = useSelector((state) => state.game);

    const startVoting = async () => {
        setLoading(true);
        console.log("Starting voting... Username: ", game.userName);
        try {
            const response = await fetch(URL_API_START_VOTING, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gameId: game.gameId
                }),
            });

            if (response.ok) {
                const startVotingMessage = await response.text();
                game?.messages?.push({
                    key: Math.random().toString(36).substring(7),
                    text: startVotingMessage,
                    timestamp: new Date(),
                    isUserMessage: false,
                    author: 'Game Master',
                    authorColor: '#fff',
                });

                const humanPlayer = { id: 'human_id', name: game.userName };
                const votingOrderWithHuman = [...game.bots, humanPlayer];
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
        const playerIdMap = new Map(game.bots.map((bot) => [bot.id, bot]));
        const votes = [];
        for (let i = 0; i < votingOrder.length; i++) {
            const voter = votingOrder[i];
            const voterId = voter.id;
            console.log("Voter: ", voter);

            if (voterId === 'human_id') {
                // Show voting modal for human player
                setVotingModalVisible(true);
                // Wait for human player to vote
                const selectedParticipantId = await new Promise((resolve) => {
                    setResolve(() => resolve);
                });
                const humanVote = {
                    voter: game.userName,
                    votedFor: playerIdMap.get(selectedParticipantId).name,
                    reason: 'No reason provided',
                };
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
                            gameId: game.gameId,
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
        const playerIdMap = new Map(game.bots.map((bot) => [bot.id, bot]));
        const voteMessage = {
            key: Math.random().toString(36).substring(7),
            text: `${vote.voter} voted for ${vote.votedFor}. Reason: ${vote.reason}`,
            timestamp: new Date(),
            isUserMessage: false,
            author: vote.voter,
            authorColor: playerIdMap.get(vote.voterId)?.color || '#fff',
        };
        game?.messages?.push(voteMessage);
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

        // todo: send leaders to the backend to add vote results to DB and to return a message from GM
        const resultMessage = `Leaders: ${leaders}`;
        game?.messages?.push({
            key: Math.random().toString(36).substring(7),
            text: resultMessage,
            isUserMessage: false,
            author: 'Game Master',
            authorColor: '#fff',
        });

        // Send voting results to the backend
        try {
            const response = await fetch(URL_API_PROCESS_VOTING_RESULT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gameId: game.gameId,
                    votes,
                }),
            });

            if (response.ok) {
                const backendResponse = await response.text();
                game?.messages?.push({
                    key: Math.random().toString(36).substring(7),
                    text: backendResponse,
                    isUserMessage: false,
                    author: 'Game Master',
                    authorColor: '#fff',
                });
            } else {
                console.error('Error processing voting result:', response.statusText);
            }
        } catch (error) {
            console.error('Error processing voting result:', error);
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

    const onHumanPlayerVote = (selectedParticipantId) => {
        resolve(selectedParticipantId);
    };

    return {
        isVotingModalVisible,
        setVotingModalVisible,
        startVoting,
        onHumanPlayerVote,
    };
};

export default useVoting;