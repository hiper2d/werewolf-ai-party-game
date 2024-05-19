import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser';
import {useSelector} from "react-redux";

const ParticipantsList = ({ onStartVoting }) => {
    const game = useSelector((state) => state.game);

    return (
        <View style={styles.participantsList}>
            <Text style={styles.sidebarHeader}>Participants</Text>
            {game.bots?.map((participant) => (
                <View key={participant.name} style={styles.participantItem}>
                    <FontAwesomeIcon icon={faUser} size={16} color={participant.color} style={styles.participantIcon} />
                    <Text style={styles.participantName}>{participant.name}</Text>
                </View>
            ))}
            <TouchableOpacity onPress={onStartVoting} style={styles.startVotingButton}>
                <Text style={styles.startVotingButtonText}>Start Voting</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    participantsList: {
        width: '20%',
        backgroundColor: '#21252b',
        padding: 10,
        position: 'relative',
        height: '100%',
    },
    sidebarHeader: {
        color: '#61dafb',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    participantItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    participantIcon: {
        marginRight: 8,
    },
    participantName: {
        color: '#abb2bf',
        fontSize: 16,
    },
    participantsListContainer: {
        flex: 1,
        justifyContent: 'space-between',
    },
    startVotingButton: {
        backgroundColor: '#61dafb',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 5,
        alignSelf: 'center',
        bottom: 20,
        position: 'absolute',
    },
    startVotingButtonText: {
        color: '#000000',
        fontWeight: 'bold',
    },
});

export default ParticipantsList;