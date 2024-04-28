import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {URL_API_DELETE_GAME, URL_API_GET_ALL_GAMES, URL_API_GET_CHAT_HISTORY, URL_API_LOAD_GAME} from "../../Constants";
import {getRandomColor, getUniqueColor} from "../../hooks/colors";

const AllGamesModal = ({
    isVisible, onClose, onGameSelect, onChatMessagesLoaded, onPlayerNameMapUpdated, onPlayerIdMapUpdated
}) => {
    const [games, setGames] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedGameId, setSelectedGameId] = useState(null);

    const fetchGames = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(URL_API_GET_ALL_GAMES);
            const data = await response.json();
            setGames(data);
            setError(null);
        } catch (error) {
            setError(error.message);
        }
        setIsLoading(false);
    }

    useEffect(() => {
        if (isVisible) {
            fetchGames();
        }
    }, [isVisible]);

    const handleGameSelect = async (gameId) => {
        setSelectedGameId(gameId);
        onGameSelect(gameId);

        try {
            const response = await fetch(`${URL_API_LOAD_GAME}/${gameId}`);
            const data = await response.json();

            const newPlayerNameMap = new Map();
            const newPlayerIdMap = new Map();

            const usedColors = [];
            data.bot_players.forEach((player, index) => {
                const uniqueColor = getUniqueColor(usedColors);
                usedColors.push(uniqueColor);
                newPlayerNameMap.set(player.name, { id: player.id, name: player.name, color: uniqueColor });
                newPlayerIdMap.set(player.id, { id: player.id, name: player.name, color: uniqueColor });
            });

            const formattedMessages = data.messages.map((message, index) => ({
                key: `${index}`,
                text: message.msg,
                timestamp: new Date(message.ts),
                isUserMessage: message.role === 'USER',
                author: message.author_name,
                authorColor: newPlayerNameMap.get(message.author_name)?.color || '#fff',
            }));

            onChatMessagesLoaded(formattedMessages);
            onPlayerNameMapUpdated(newPlayerNameMap);
            onPlayerIdMapUpdated(newPlayerIdMap);
        } catch (error) {
            console.error('Error fetching game data:', error);
        }

        onClose();
    };

    const handleDeleteGame = async (gameId) => {
        try {
            const response = await fetch(`${URL_API_DELETE_GAME}/${gameId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                // Refresh the game list after deleting the game
                fetchGames();
            } else {
                console.error('Error deleting game:', response.statusText);
            }
        } catch (error) {
            console.error('Error deleting game:', error);
        }
    };

    const renderGame = ({ item }) => (
        <Pressable
            onPress={() => handleGameSelect(item.id)}
            style={[
                styles.gameContainer,
                selectedGameId === item.id && styles.selectedGameContainer,
            ]}
        >
            <View style={styles.gameDetails}>
                <Text style={[styles.gameText, styles.gameId]}>{item.id}</Text>
                <Text style={[styles.gameText, styles.gameName]}>{item.name}</Text>
                <Text style={[styles.gameText, styles.gameDay]}>Day {item.current_day}</Text>
                <Text style={[styles.gameText, styles.gameTimestamp]}>{item.ts}</Text>
                <View style={styles.deleteButtonContainer}>
                    <Pressable onPress={() => handleDeleteGame(item.id)} style={styles.deleteButton}>
                        <Text style={styles.deleteIcon}>X</Text>
                    </Pressable>
                </View>
            </View>
        </Pressable>
    );

    return (
        <Modal visible={isVisible} animationType="slide" transparent={true}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>All Games</Text>
                    <View style={styles.headerContainer}>
                        <Text style={[styles.headerText, styles.gameId]}>ID</Text>
                        <Text style={[styles.headerText, styles.gameName]}>Name</Text>
                        <Text style={[styles.headerText, styles.gameDay]}>Day</Text>
                        <Text style={[styles.headerText, styles.gameTimestamp]}>Timestamp</Text>
                        <Text style={[styles.headerText, styles.deleteHeader]}>Delete</Text>
                    </View>
                    {isLoading ? (
                        <Text style={styles.loadingText}>Loading...</Text>
                    ) : error ? (
                        <Text style={styles.errorText}>Error: {error}</Text>
                    ) : (
                        <FlatList
                            data={games}
                            renderItem={renderGame}
                            keyExtractor={(item) => item.id.toString()}
                            style={styles.gameList}
                        />
                    )}
                    <View style={styles.buttonContainer}>
                        <Pressable onPress={onClose} style={[styles.button, styles.cancelButton]}>
                            <Text style={styles.buttonText}>Close</Text>
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
        borderRadius: 10,
        padding: 20,
        width: '80%',
        maxHeight: '80%',
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
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#61dafb',
        padding: 10,
        marginVertical: 5,
        borderRadius: 5,
        width: '100%'
    },
    selectedGameContainer: {
        backgroundColor: 'rgba(97, 218, 251, 0.2)',
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#61dafb',
        paddingBottom: 10,
        marginBottom: 10,
        width: '100%'
    },
    headerText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    gameId: {
        width: '15%',
    },
    gameName: {
        width: '25%',
    },
    gameDay: {
        width: '10%',
    },
    gameTimestamp: {
        width: '30%',
    },
    gameDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    gameText: {
        fontSize: 16,
        color: '#fff',
    },
    loadingText: {
        fontSize: 16,
        color: '#61dafb',
        marginVertical: 10,
    },
    errorText: {
        fontSize: 16,
        color: '#ff0000',
        marginVertical: 10,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        width: '100%',
        marginTop: 20,
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    cancelButton: {
        backgroundColor: '#61dafb',
    },
    buttonText: {
        color: '#282c34',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // delete header and column
    deleteHeader: {
        width: '10%',
        textAlign: 'center',
    },
    deleteButtonContainer: {
        width: '10%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButton: {
        backgroundColor: '#ff0000',
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 2,
    },
    deleteIcon: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default AllGamesModal;