import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser';

const participantColors = [
    '#61dafb', // React blue
    '#a0f0ed', // Light blue
    '#50e3c2', // Turquoise
    '#f8c555', // Yellow
    '#f76b1c', // Orange
    '#e44d26', // Red
    '#cd84f1', // Pink
    '#c56cf0', // Purple
    '#ffcc00', // Gold
    '#67e480', // Green
];

const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * participantColors.length);
    return participantColors[randomIndex];
};

const ParticipantsList = ({ participants }) => {
    return (
        <View style={styles.participantsList}>
            <Text style={styles.sidebarHeader}>Participants</Text>
            {participants.map((participant) => (
                <View key={participant.name} style={styles.participantItem}>
                    <FontAwesomeIcon
                        icon={faUser}
                        size={16}
                        color={participant.color}
                        style={styles.participantIcon}
                    />
                    <Text style={styles.participantName}>{participant.name}</Text>
                </View>
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
});

export default ParticipantsList;