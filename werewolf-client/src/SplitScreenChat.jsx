import React, {useRef, useState} from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import MenuBar from './components/MenuBar';
import ParticipantsList from './components/ParticipantsList';
import ChatMessages from './components/ChatMessages';
import InputArea from './components/InputArea';
import NewGameModal from './components/NewGameModal';
import Loader from './components/Loader';
import {URL_API_ASK_CERTAIN_PLAYER_TO_VOTE,} from "./Constants";
import useChatMessages from "././hooks/useChatMessages";
import useGame from "././hooks/useGame";
import useInitGame from "././hooks/useInitGame";

const SplitScreenChat = () => {
    const [inputText, setInputText] = useState('');
    const scrollViewRef = useRef(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const {
        gameId,
        setGameId,
        userName,
        setUserName,
        gameName,
        setGameName,
        gameTheme,
        setGameTheme,
        isLoading,
        setIsLoading,
        playerIdMap,
        setPlayerIdMap,
        playerNameMap,
        setPlayerNameMap,
    } = useGame();

    const {messages, setMessages, sendMessage} = useChatMessages();
    const {handleNewGameModalOkPress} = useInitGame(isModalVisible, setIsModalVisible, setMessages);

    const handleIconPress = (iconName) => {
        console.log(`Icon pressed: ${iconName}`);
    };

    const handleMenuPress = (menuItem) => {
        if (menuItem === 'New Game') {
            handleNewGamePress();
        } else if (menuItem === 'All Games') {
            console.log('Navigate to All Games screen');
        }
    };

    const handleNewGamePress = () => {
        setIsModalVisible(true);
    };

    const handleVote = async (participantId) => {
        const votingResults = new Map();
        const participantIds = Array.from(playerIdMap.keys()); // Assuming you have a map of participant IDs
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

                    const { name, reason } = jsonResponse; // Extract fields from the stored response

                    if (name) {
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
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <MenuBar onMenuPress={handleMenuPress} onIconPress={handleIconPress}/>
            <View style={styles.container}>
                <ParticipantsList
                    participants={Array.from(playerIdMap.values())}
                    onVote={handleVote}
                />
                <View style={styles.chatContainer}>
                    <ChatMessages messages={messages} scrollViewRef={scrollViewRef}/>
                    <InputArea
                        inputText={inputText}
                        onChangeText={setInputText}
                        onSendMessage={() => sendMessage(inputText, gameId, userName, playerNameMap)}
                    />
                </View>
            </View>
            <NewGameModal
                isVisible={isModalVisible}
                onClose={() => setIsModalVisible(false)}
                onOkPress={() => handleNewGameModalOkPress(
                    setIsLoading, userName, gameName, gameTheme, setGameId, setPlayerIdMap, setPlayerNameMap,
                    setGameName, setGameTheme
                )}
                userName={userName}
                onUserNameChange={setUserName}
                gameName={gameName}
                onGameNameChange={setGameName}
                gameTheme={gameTheme}
                onGameThemeChange={setGameTheme}
            />
            {isLoading && <Loader/>}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#282c34',
    },
    container: {
        flex: 1,
        flexDirection: 'row',
    },
    chatContainer: {
        width: '80%',
        padding: 10,
    },
});

export default SplitScreenChat;
