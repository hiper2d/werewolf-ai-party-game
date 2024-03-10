import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const ParticipantsList = ({ participants }) => {
    return (
        <View style={styles.participantsList}>
            <Text style={styles.sidebarHeader}>Participants</Text>
            {participants.map((participant) => (
                <Text key={participant} style={styles.participantName}>
                    {participant}
                </Text>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    participantsList: {
        width: '30%',
        backgroundColor: '#21252b',
        padding: 10,
    },
    sidebarHeader: {
        color: '#61dafb',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    participantName: {
        color: '#abb2bf',
        fontSize: 16,
        paddingVertical: 8,
    },
});

export default ParticipantsList;