import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import CustomDropdown from './CustomDropdown';

const VotingModal = ({ isVisible, onClose, participants, onHumanPlayerVote }) => {
    const [selectedParticipant, setSelectedParticipant] = useState(null);

    const handleVote = () => {
        if (selectedParticipant) {
            onHumanPlayerVote(selectedParticipant.value);
        }
        onClose();
    };

    const participantOptions = participants.map((participant) => ({
        label: participant.name,
        value: participant.id,
    }));

    return (
        <Modal visible={isVisible} animationType="slide" transparent={true}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Select a participant to vote</Text>
                    <CustomDropdown
                        options={participantOptions}
                        onSelect={setSelectedParticipant}
                        placeholder="Select a participant"
                    />
                    <View style={styles.modalButtonContainer}>
                        <Pressable
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.modalButton,
                                styles.cancelButton,
                                pressed && styles.buttonPressed,
                            ]}
                        >
                            <Text style={styles.modalButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleVote}
                            style={({ pressed }) => [
                                styles.modalButton,
                                styles.okButton,
                                !selectedParticipant && styles.disabledButton,
                                pressed && styles.buttonPressed,
                            ]}
                            disabled={!selectedParticipant}
                        >
                            <Text style={styles.modalButtonText}>Vote</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#282c34',
        padding: 20,
        borderRadius: 10,
        width: '50%',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#61dafb',
    },
    modalButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 20,
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    cancelButton: {
        backgroundColor: '#61dafb',
    },
    okButton: {
        backgroundColor: '#61dafb',
    },
    modalButtonText: {
        color: '#282c34',
        fontSize: 16,
    },
    disabledButton: {
        opacity: 0.5,
    },
    buttonPressed: {
        opacity: 0.5,
    },
});

export default VotingModal;