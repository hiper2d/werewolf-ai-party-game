import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const AllGamesModal = ({ isVisible, onClose, games, onGameSelect }) => {
    const renderGame = ({ item }) => (
        <Pressable
            onPress={() => onGameSelect(item.id)}
            style={styles.gameContainer}
        >
            <Text style={styles.gameName}>{item.name}</Text>
            <Text style={styles.gameTheme}>{item.theme}</Text>
        </Pressable>
    );

    return (
        <Modal visible={isVisible} animationType="slide" transparent={true}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>All Games</Text>
                    <FlatList
                        data={games}
                        renderItem={renderGame}
                        keyExtractor={(item) => item.id.toString()}
                        style={styles.gameList}
                    />
                    <Pressable
                        onPress={onClose}
                        style={({ pressed }) => [
                            styles.modalButton,
                            styles.cancelButton,
                            pressed && styles.buttonPressed,
                        ]}
                    >
                        <Text style={styles.modalButtonText}>Close</Text>
                    </Pressable>
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
        width: '80%',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#61dafb',
    },
    gameList: {
        width: '100%',
    },
    gameContainer: {
        backgroundColor: '#61dafb',
        padding: 10,
        marginVertical: 5,
        borderRadius: 5,
    },
    gameName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#282c34',
    },
    gameTheme: {
        fontSize: 14,
        color: '#282c34',
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
        marginTop: 20,
    },
    cancelButton: {
        backgroundColor: '#61dafb',
    },
    modalButtonText: {
        color: '#282c34',
        fontSize: 16,
    },
    buttonPressed: {
        opacity: 0.5,
    },
});

export default AllGamesModal;